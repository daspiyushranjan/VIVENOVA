import os
import sys
import logging
from typing import Generator
from urllib.parse import urlparse

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from app.config import settings

logger = logging.getLogger("deskpilot.database")

Base = declarative_base()


def determine_database_url(raw_url: str) -> str:
    """
    Normalizes the database URL for Supabase PostgreSQL.
    Supports postgresql://, postgres://, and postgresql+psycopg://.
    Uses Psycopg 3 when available; falls back to pure-Python pg8000
    if psycopg's binary wrapper is blocked by OS environment policies (e.g. Windows WDAC).
    Ensures sslmode=require for Supabase and remote PostgreSQL endpoints.
    """
    if not raw_url:
        return ""

    url = raw_url.strip()

    # Determine driver availability
    use_psycopg = False
    try:
        import psycopg  # noqa: F401
        use_psycopg = True
    except Exception as e:
        logger.warning("Psycopg 3 native binary not available (%s); falling back to pg8000 driver.", e)

    target_driver = "postgresql+psycopg" if use_psycopg else "postgresql+pg8000"

    parsed = urlparse(url)
    scheme = parsed.scheme

    # Replace scheme with appropriate dialect
    if scheme in ("postgres", "postgresql"):
        url = url.replace(f"{scheme}://", f"{target_driver}://", 1)
    elif scheme == "postgresql+psycopg" and not use_psycopg:
        url = url.replace("postgresql+psycopg://", "postgresql+pg8000://", 1)

    # Ensure sslmode=require for Supabase and remote PostgreSQL endpoints
    is_supabase = any(domain in url for domain in ("supabase.co", "supabase.com", "pooler.supabase.com"))
    if "sslmode" not in url and (is_supabase or "ssl=true" in url or ":5432" in url or ":6543" in url):
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"

    return url


# Create Engine and SessionLocal
DATABASE_URL = determine_database_url(settings.DATABASE_URL)

engine = None
SessionLocal = None

if DATABASE_URL:
    try:
        connect_args = {}
        # Special handling for pg8000 ssl if needed
        if "pg8000" in DATABASE_URL and "sslmode" in DATABASE_URL:
            import ssl
            ssl_ctx = ssl.create_default_context()
            connect_args["ssl_context"] = ssl_ctx
            # Remove sslmode query param for pg8000 as it uses ssl_context
            clean_url = DATABASE_URL.replace("?sslmode=require", "").replace("&sslmode=require", "")
            engine = create_engine(
                clean_url,
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_recycle=300,
                echo=False,
            )
        else:
            # Psycopg 3 connection arguments
            # If using Supabase transaction pooler (port 6543), disable prepared statements
            if ":6543" in DATABASE_URL or "pooler.supabase" in DATABASE_URL:
                connect_args["prepare_threshold"] = None

            engine = create_engine(
                DATABASE_URL,
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_recycle=300,
                echo=False,
            )
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        logger.info("Supabase PostgreSQL database engine initialized successfully.")
    except Exception as e:
        logger.error("Failed to initialize database engine: %s", e)
        engine = None
        SessionLocal = None
else:
    logger.warning("No DATABASE_URL configured. Database operations will require active Supabase PostgreSQL credentials.")


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that provides a transactional database session.
    Rolls back on unhandled error and always closes the session safely.
    """
    if SessionLocal is None:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Database is not configured. Please set a valid DATABASE_URL in the .env file.",
        )
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def check_db_connection() -> dict:
    """
    Performs a connection health check using SELECT 1.
    Provides diagnostic details on quota limits, auth errors, and connectivity.
    """
    if not engine:
        return {
            "status": "disconnected",
            "message": "DATABASE_URL environment variable is not configured or engine failed to initialize.",
            "driver": "none"
        }
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1")).scalar()
            if result == 1:
                return {
                    "status": "connected",
                    "driver": engine.dialect.name,
                    "message": "Supabase PostgreSQL connection healthy"
                }
            return {
                "status": "error",
                "driver": engine.dialect.name,
                "message": "Unexpected response from database query"
            }
    except Exception as exc:
        err_msg = str(exc)
        # Check for specific quota or account limits
        is_limit_or_quota = any(term in err_msg.lower() for term in (
            "quota exceeded", "limit exceeded", "too many connections",
            "max client connections", "tenant or user is disabled", "paused"
        ))
        return {
            "status": "quota_or_limit_error" if is_limit_or_quota else "disconnected",
            "driver": engine.dialect.name if engine else "unknown",
            "message": f"Connection error: {err_msg}"
        }
