import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import engine, Base, SessionLocal, check_db_connection
from app.seed import seed_demo_data
from app.schemas import HealthResponse

# Import all route modules
from app.routes.orders import router as orders_router
from app.routes.refunds import router as refunds_router
from app.routes.tickets import router as tickets_router
from app.routes.conversations import router as conversations_router
from app.routes.agents import router as agents_router
from app.routes.knowledge import router as knowledge_router
from app.routes.analytics import router as analytics_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("deskpilot.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Auto-creates database tables and seeds demo data on startup.
    """
    logger.info("Starting DeskPilot API v%s...", settings.VERSION)

    # 1. Initialize tables and seed data if database is accessible
    if engine is not None:
        try:
            logger.info("Ensuring database tables exist in PostgreSQL...")
            Base.metadata.create_all(bind=engine)
            logger.info("Database tables verified.")

            # Seed demo data if database is empty
            if SessionLocal is not None:
                with SessionLocal() as db:
                    try:
                        seed_demo_data(db)
                    except Exception as seed_err:
                        logger.warning("Could not complete demo seeding: %s", seed_err)
        except Exception as db_err:
            logger.error("Error during database startup initialization: %s", db_err)
    else:
        logger.warning("No active database engine. Provide DATABASE_URL in .env to connect to Supabase PostgreSQL.")

    yield

    logger.info("DeskPilot API shutting down.")


# Initialize FastAPI application
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global Exception Handler to never leak internal stack traces to clients
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception processing request %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred. Please try again or contact system support.",
            "path": request.url.path,
        }
    )


# Health check endpoint
@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    """
    Health check endpoint verifying application uptime and database connectivity.
    """
    db_status = check_db_connection()
    return HealthResponse(
        status="healthy",
        database=db_status.get("status", "disconnected"),
        database_type=db_status.get("driver", "none"),
        message=db_status.get("message"),
    )


# Root redirect or greeting
@app.get("/", tags=["Root"])
def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "description": settings.DESCRIPTION,
        "status": "online",
        "documentation": "/docs",
        "health": "/health",
    }


# Include all application routers
app.include_router(orders_router)
app.include_router(refunds_router)
app.include_router(tickets_router)
app.include_router(conversations_router)
app.include_router(agents_router)
app.include_router(knowledge_router)
app.include_router(analytics_router)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", str(settings.PORT)))
    uvicorn.run("app.main:app", host=settings.HOST, port=port, reload=True)
