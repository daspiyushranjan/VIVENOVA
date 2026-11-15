import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import check_db_connection, determine_database_url


def test_health_endpoint():
    """Verify GET /health returns 200 with required structure."""
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "database" in data
        assert "database_type" in data


def test_root_endpoint():
    """Verify root / endpoint returns project metadata."""
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["app"] == "DeskPilot"
        assert data["status"] == "online"


def test_db_connectivity_check():
    """Verify check_db_connection returns proper diagnostic dict."""
    status_dict = check_db_connection()
    assert isinstance(status_dict, dict)
    assert "status" in status_dict
    assert "driver" in status_dict
    assert "message" in status_dict


def test_supabase_direct_url_normalization():
    """Verify Supabase direct connection URL has dialect normalized and sslmode enforced."""
    raw_supabase_url = "postgresql://postgres:mypassword@db.abcdefghijklm.supabase.co:5432/postgres"
    normalized = determine_database_url(raw_supabase_url)
    assert "psycopg" in normalized or "pg8000" in normalized
    assert "sslmode=require" in normalized
    assert "db.abcdefghijklm.supabase.co" in normalized


def test_supabase_pooler_url_normalization():
    """Verify Supabase connection pooler URL has dialect normalized and sslmode enforced."""
    raw_pooler_url = "postgresql://postgres.abcdefghijklm:mypassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    normalized = determine_database_url(raw_pooler_url)
    assert "psycopg" in normalized or "pg8000" in normalized
    assert "sslmode=require" in normalized
    assert "6543" in normalized
