import os
from typing import List
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings:
    """Application configuration settings."""
    PROJECT_NAME: str = "DeskPilot"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "AI-Powered Autonomous Customer Support Desk API"

    # Server configuration
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Database configuration
    DATABASE_URL: str = os.getenv("DATABASE_URL", "").strip()

    # Security & Access Control
    API_KEY: str = os.getenv("API_KEY", "deskpilot-hackathon-agent-key")
    REQUIRE_API_KEY: bool = os.getenv("REQUIRE_API_KEY", "false").lower() in ("true", "1", "yes")

    # CORS configuration
    CORS_ORIGINS_RAW: str = os.getenv("CORS_ORIGINS", "*")

    @property
    def cors_origins(self) -> List[str]:
        """Parse CORS origins as list."""
        if not self.CORS_ORIGINS_RAW or self.CORS_ORIGINS_RAW.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS_RAW.split(",") if origin.strip()]

settings = Settings()
