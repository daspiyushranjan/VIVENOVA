from typing import Optional
from fastapi import Header, HTTPException, Security, status
from app.config import settings


def verify_agent_access(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> bool:
    """
    Validates API key for agent and administrative endpoints.
    In development mode or when REQUIRE_API_KEY is false, it logs/allows requests with default key.
    When REQUIRE_API_KEY is true, strictly requires a matching key.
    """
    if not settings.REQUIRE_API_KEY:
        return True

    if not x_api_key or x_api_key.strip() != settings.API_KEY.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid or missing API key in X-API-Key header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return True
