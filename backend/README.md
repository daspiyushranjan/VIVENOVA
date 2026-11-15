# DeskPilot — AI-Powered Autonomous Customer Support Desk MVP

DeskPilot is a production-ready, resilient backend MVP for an AI-powered autonomous customer support desk built for high reliability, strict business rule enforcement, and seamless human agent collaboration.

---

## 1. Technology Stack

- **Framework**: FastAPI (Python 3.10+)
- **Structured Database**: Supabase PostgreSQL (via `DATABASE_URL`)
- **ORM & Driver**: SQLAlchemy 2.0 with Psycopg 3 & pg8000 fallback
- **Validation**: Pydantic v2
- **Server**: Uvicorn ASGI
- **Configuration**: python-dotenv
- **Vector Storage (Planned)**: Qdrant Cloud (for RAG search, decoupled from structured business tables)

---

## 2. Architecture & Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI application, CORS, lifespan, exception handlers
│   ├── config.py            # Environment configuration & settings
│   ├── database.py          # Supabase PostgreSQL SSL connection, pooling, health checks
│   ├── models.py            # SQLAlchemy models (UUID PKs, FKs, constraints)
│   ├── schemas.py           # Pydantic schemas for requests, responses, enums
│   ├── seed.py              # Auto-seeder for demo data when database is empty
│   ├── dependencies.py      # API key authentication & access control
│   ├── routes/
│   │   ├── orders.py        # Order search & lookup
│   │   ├── refunds.py       # Non-destructive check & atomic refund initiation
│   │   ├── tickets.py       # Support tickets & dynamic SLA calculation
│   │   ├── conversations.py # Conversation logs & human takeover lock
│   │   ├── agents.py        # Human takeover, release & reply
│   │   ├── knowledge.py     # Knowledge base keyword search & gap tracking
│   │   └── analytics.py     # Real-time metrics computed directly from database
│   └── services/
│       ├── refund_service.py# Pure server-side refund eligibility & row locking
│       └── sla_service.py   # SLA deadline targets & breach evaluation
├── tests/
│   ├── test_services.py     # Pure business rule & SLA calculation tests
│   ├── test_api_endpoints.py# Complete API endpoints test suite
│   └── test_health_and_db.py# Health check and DB connectivity diagnostics
├── requirements.txt         # Production dependencies
├── .env.example             # Example environment variables
├── .gitignore               # Git ignore rules
├── AI_INTEGRATION.md        # AI Agent tool integration documentation
└── README.md                # Project documentation
```

---

## 3. Database Schema (Supabase PostgreSQL)

All primary keys use UUIDs (`uuid.uuid4`).

| Table | Description |
|---|---|
| `CUSTOMERS` | Customer account details (`id`, `name`, `email`, `created_at`) |
| `ORDERS` | Customer orders (`order_number`, `customer_id`, `product_name`, `amount`, `status`, `created_at`) |
| `REFUNDS` | Simulated refund records (`order_id`, `amount`, `reason`, `status`, `created_at`) |
| `TICKETS` | Support tickets (`customer_id`, `conversation_id`, `title`, `description`, `priority`, `status`, `assigned_agent`, `sla_deadline`, `created_at`, `resolved_at`) |
| `CONVERSATIONS` | Customer chats (`customer_id`, `status`, `assigned_agent`, `created_at`, `updated_at`) |
| `MESSAGES` | Chronological messages (`conversation_id`, `sender_type`, `content`, `created_at`) |
| `KNOWLEDGE_ARTICLES` | Knowledge base (`title`, `content`, `version`, `created_at`) |
| `KNOWLEDGE_GAPS` | Unanswered questions when search finds 0 matches (`question`, `status`, `created_at`) |

*Note: Vector embeddings are not stored in these structured tables. Qdrant Cloud will handle vector storage separately for RAG.*

---

## 4. Business Rules

### Refund Validation Engine (`app/services/refund_service.py`)
AI is **never trusted** to approve refunds. The backend validates:
1. **Status**: Only `delivered` or `cancelled` orders are eligible. `processing` and `shipped` orders are ineligible.
2. **Age**: Orders older than 30 days are ineligible.
3. **Previous Refunds**: Cannot refund an order already marked `refunded` or where prior refunds sum to the order total.
4. **Amount**: Refund amount cannot exceed original order amount or remaining balance.
5. **Concurrency & Duplicates**: Database row locking (`with_for_update`) ensures simultaneous requests cannot create duplicate refunds.
6. **Simulated**: Refunds are recorded as `completed` without calling live banking networks.

### SLA Management (`app/services/sla_service.py`)
- `critical`: 5 minutes
- `high`: 15 minutes
- `medium`: 60 minutes
- `low`: 240 minutes

Every ticket response dynamically computes `is_sla_breached` and `minutes_to_sla_deadline`.

### Human Takeover & AI Lock (`app/routes/conversations.py`)
- When a human agent takes over (`POST /api/agents/takeover/{conversation_id}`), status becomes `human_handling`.
- While in `human_handling` or `waiting_for_human`, any incoming AI assistant message (`sender_type="assistant"`) is rejected with **403 Forbidden**.
- Once released (`POST /api/agents/release/{conversation_id}`), AI responses are re-enabled.

---

## 5. Local Setup & Running

### Step 1: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your Supabase PostgreSQL connection string from the Supabase Dashboard:
(**Project Settings -> Database -> Connection string -> URI**)

```ini
# Direct Connection (Port 5432)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?sslmode=require

# Or Connection Pooler (Port 6543)
# DATABASE_URL=postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require

PORT=8000
```

### Step 3: Run the Application
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The app will:
1. Connect to Supabase PostgreSQL.
2. Automatically create all tables (`Base.metadata.create_all`).
3. Seed realistic demo data (customers, orders, knowledge articles, tickets) if empty.
4. Provide interactive Swagger API docs at `http://localhost:8000/docs`.

---

## 6. Running Tests

Run the full pytest suite:

```bash
python -m pytest tests/ -v
```

All 32 unit and integration tests verify:
- Health check and DB connectivity diagnostics
- Supabase direct and connection pooler URL normalization
- Order lookup
- Refund eligibility business rules
- Refund initiation and atomic locking
- Duplicate refund rejection
- Ticket creation and SLA deadline calculation
- Ticket status updates
- Conversation creation and message history
- Human takeover lock and AI message blocking
- Knowledge base keyword search and knowledge gap recording
- Real-time database analytics aggregation

---

## 7. Render Deployment Guide

### Deploying on Render

1. **Create Web Service**:
   - In Render Dashboard, click **New +** -> **Web Service**.
   - Connect your GitHub / GitLab repository.

2. **Configure Settings**:
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**:
     ```bash
     uvicorn app.main:app --host 0.0.0.0 --port $PORT
     ```

3. **Configure Environment Variables in Render**:
   - `DATABASE_URL`: Your Supabase PostgreSQL connection URI (`postgresql://...?sslmode=require`).
   - `PORT`: Automatically set by Render.
   - `ENVIRONMENT`: `production`
   - `REQUIRE_API_KEY`: `false` (or `true` if enforcing `X-API-Key` headers)
   - `CORS_ORIGINS`: `*` (or your frontend domain)

4. **Verify Deployment**:
   - Visit `https://<your-render-url>/health`
   - Response:
     ```json
     {
       "status": "healthy",
       "database": "connected",
       "database_type": "postgresql",
       "message": "Supabase PostgreSQL connection healthy"
     }
     ```
   - Swagger documentation is available at `https://<your-render-url>/docs`.
