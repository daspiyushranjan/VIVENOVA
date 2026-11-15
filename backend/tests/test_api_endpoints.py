import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db, check_db_connection
from app.models import Customer, Order, Refund, Ticket, Conversation, Message, KnowledgeArticle, KnowledgeGap
from app.services.sla_service import calculate_sla_deadline


class InMemoryMockDB:
    """
    In-memory mock store that mimics SQLAlchemy session behavior
    WITHOUT using SQLite or external databases when Supabase credentials are not yet configured.
    """
    def __init__(self):
        self.customers = {}
        self.orders = {}
        self.refunds = {}
        self.tickets = {}
        self.conversations = {}
        self.messages = {}
        self.articles = {}
        self.gaps = {}
        self._populate_initial()

    def _populate_initial(self):
        now = datetime.now(timezone.utc)
        # Customer
        c_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
        customer = Customer(
            id=c_id,
            name="Sarah Connor",
            email="sarah.connor@sky-shield.io",
            created_at=now - timedelta(days=60),
        )
        self.customers[c_id] = customer

        # Orders
        # ORD-1001: Delivered 5 days ago (eligible)
        o1_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
        ord_1001 = Order(
            id=o1_id,
            order_number="ORD-1001",
            customer_id=c_id,
            product_name="Noise-Cancelling Headphones Pro",
            amount=Decimal("199.99"),
            status="delivered",
            created_at=now - timedelta(days=5),
        )
        ord_1001.refunds = []
        self.orders[o1_id] = ord_1001

        # ORD-1005: Already refunded (ineligible)
        o5_id = uuid.UUID("55555555-5555-5555-5555-555555555555")
        ord_1005 = Order(
            id=o5_id,
            order_number="ORD-1005",
            customer_id=c_id,
            product_name="Smart Fitness Watch V2",
            amount=Decimal("220.00"),
            status="refunded",
            created_at=now - timedelta(days=12),
        )
        ord_1005.refunds = []
        self.orders[o5_id] = ord_1005

        # Conversation
        conv_id = uuid.UUID("66666666-6666-6666-6666-666666666666")
        conv = Conversation(
            id=conv_id,
            customer_id=c_id,
            status="ai_handling",
            assigned_agent=None,
            created_at=now - timedelta(hours=1),
            updated_at=now - timedelta(hours=1),
        )
        conv.messages = []
        self.conversations[conv_id] = conv

        # Knowledge article
        art_id = uuid.UUID("77777777-7777-7777-7777-777777777777")
        art = KnowledgeArticle(
            id=art_id,
            title="Standard 30-Day Refund & Return Policy",
            content="Customers may request a refund within 30 days on delivered or cancelled orders.",
            version=1,
            created_at=now - timedelta(days=10),
        )
        self.articles[art_id] = art

        # Tickets
        t1_id = uuid.UUID("88888888-8888-8888-8888-888888888888")
        t1 = Ticket(
            id=t1_id,
            customer_id=c_id,
            conversation_id=conv_id,
            title="Headphones earcup static noise",
            description="Hardware distortion reported by user",
            priority="high",
            status="open",
            sla_deadline=calculate_sla_deadline(now - timedelta(minutes=5), "high"),
            created_at=now - timedelta(minutes=5),
        )
        self.tickets[t1_id] = t1

    def query(self, model):
        store = self

        class MockQuery:
            def __init__(self, target_model):
                self.target_model = target_model
                self.filters = []
                self._limit = None
                self._offset = None

            def with_for_update(self):
                return self

            def filter(self, *criteria):
                self.filters.extend(criteria)
                return self

            def join(self, *args, **kwargs):
                return self

            def order_by(self, *args):
                return self

            def offset(self, n):
                self._offset = n
                return self

            def limit(self, n):
                self._limit = n
                return self

            def count(self):
                return len(self.all())

            def first(self):
                items = self.all()
                return items[0] if items else None

            def all(self):
                if self.target_model == Customer:
                    items = list(store.customers.values())
                elif self.target_model == Order:
                    items = list(store.orders.values())
                elif self.target_model == Refund:
                    items = list(store.refunds.values())
                elif self.target_model == Ticket:
                    items = list(store.tickets.values())
                elif self.target_model == Conversation:
                    items = list(store.conversations.values())
                elif self.target_model == Message:
                    items = list(store.messages.values())
                elif self.target_model == KnowledgeArticle:
                    items = list(store.articles.values())
                elif self.target_model == KnowledgeGap:
                    items = list(store.gaps.values())
                else:
                    items = []

                # Apply basic in-memory filtering for test scenarios
                for c in self.filters:
                    try:
                        # Check if or_ clause (e.g. knowledge search)
                        clauses = getattr(c, "clauses", [c])
                        if hasattr(c, "clauses"):
                            matched = []
                            for it in items:
                                it_matches = False
                                for clause in clauses:
                                    left = getattr(clause.left, "name", None)
                                    right = getattr(clause.right, "value", None)
                                    if left and right is not None:
                                        pat = str(right).strip("%").lower()
                                        val = str(getattr(it, left, "")).lower()
                                        if pat in val:
                                            it_matches = True
                                            break
                                if it_matches:
                                    matched.append(it)
                            items = matched
                        else:
                            left = c.left.name if hasattr(c, "left") else None
                            right = c.right.value if hasattr(c, "right") and hasattr(c.right, "value") else None
                            op_name = getattr(c.operator, "__name__", "")

                            if left and right is not None:
                                if op_name in ("eq", "__eq__"):
                                    items = [it for it in items if getattr(it, left, None) == right]
                                elif op_name in ("ne", "__ne__"):
                                    items = [it for it in items if getattr(it, left, None) != right]
                                elif "like" in op_name.lower():
                                    pat = str(right).strip("%").lower()
                                    items = [it for it in items if pat in str(getattr(it, left, "")).lower()]
                    except Exception:
                        pass

                return items

        return MockQuery(model)

    def add(self, obj):
        if not getattr(obj, "id", None):
            obj.id = uuid.uuid4()
        if hasattr(obj, "created_at") and not getattr(obj, "created_at", None):
            obj.created_at = datetime.now(timezone.utc)
        if hasattr(obj, "updated_at") and not getattr(obj, "updated_at", None):
            obj.updated_at = datetime.now(timezone.utc)

        if isinstance(obj, Customer):
            self.customers[obj.id] = obj
        elif isinstance(obj, Order):
            self.orders[obj.id] = obj
        elif isinstance(obj, Refund):
            self.refunds[obj.id] = obj
            # Link to order
            ord_obj = self.orders.get(obj.order_id)
            if ord_obj:
                obj.order = ord_obj
                if not hasattr(ord_obj, "refunds") or ord_obj.refunds is None:
                    ord_obj.refunds = []
                ord_obj.refunds.append(obj)
        elif isinstance(obj, Ticket):
            self.tickets[obj.id] = obj
        elif isinstance(obj, Conversation):
            if not hasattr(obj, "messages") or obj.messages is None:
                obj.messages = []
            self.conversations[obj.id] = obj
        elif isinstance(obj, Message):
            self.messages[obj.id] = obj
            conv = self.conversations.get(obj.conversation_id)
            if conv:
                if not hasattr(conv, "messages") or conv.messages is None:
                    conv.messages = []
                conv.messages.append(obj)
        elif isinstance(obj, KnowledgeArticle):
            self.articles[obj.id] = obj
        elif isinstance(obj, KnowledgeGap):
            self.gaps[obj.id] = obj

    def add_all(self, objs):
        for o in objs:
            self.add(o)

    def flush(self):
        pass

    def commit(self):
        pass

    def rollback(self):
        pass

    def refresh(self, obj):
        pass

    def close(self):
        pass


@pytest.fixture
def test_client():
    """Provides a TestClient with mock DB session override if Supabase is not connected."""
    is_live_connected = (check_db_connection().get("status") == "connected")

    if not is_live_connected:
        mock_db = InMemoryMockDB()

        def override_get_db():
            yield mock_db

        app.dependency_overrides[get_db] = override_get_db
        with TestClient(app) as client:
            yield client
        app.dependency_overrides.clear()
    else:
        # Use live Supabase database directly
        with TestClient(app) as client:
            yield client


class TestApiEndpoints:
    """Full API tests covering all requirements from Section 6 and Section 14."""

    def test_order_lookup(self, test_client):
        response = test_client.get("/api/orders/by-number/ORD-1001")
        assert response.status_code == 200
        data = response.json()
        assert data["order_number"] == "ORD-1001"
        assert data["status"] == "delivered"
        assert data["amount"] == 199.99

    def test_refund_eligibility_check_eligible(self, test_client):
        payload = {
            "order_number": "ORD-1001",
            "reason": "Defective audio on arrival"
        }
        response = test_client.post("/api/refunds/check", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["eligible"] is True
        assert data["order_number"] == "ORD-1001"
        assert data["remaining_eligible_amount"] == 199.99

    def test_refund_eligibility_check_ineligible_already_refunded(self, test_client):
        payload = {
            "order_number": "ORD-1005",
            "reason": "Requesting another refund"
        }
        response = test_client.post("/api/refunds/check", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["eligible"] is False
        assert "already been fully refunded" in data["message"].lower()

    def test_refund_initiation(self, test_client):
        payload = {
            "order_number": "ORD-1001",
            "amount": 100.00,
            "reason": "Partial dissatisfaction with accessories"
        }
        response = test_client.post("/api/refunds/initiate", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "completed"
        assert data["amount"] == 100.00
        assert data["reason"] == payload["reason"]

    def test_duplicate_refund_rejection(self, test_client):
        # Order ORD-1005 is already marked refunded
        payload = {
            "order_number": "ORD-1005",
            "amount": 50.00,
            "reason": "Attempting second refund on already refunded order"
        }
        response = test_client.post("/api/refunds/initiate", json=payload)
        assert response.status_code == 400
        assert "already been fully refunded" in response.json()["detail"].lower()

    def test_ticket_creation(self, test_client):
        payload = {
            "customer_id": "11111111-1111-1111-1111-111111111111",
            "title": "API Integration Test Ticket",
            "description": "Customer needs assistance configuring credentials",
            "priority": "critical"
        }
        response = test_client.post("/api/tickets", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == payload["title"]
        assert data["priority"] == "critical"
        assert "sla_deadline" in data
        assert "is_sla_breached" in data

    def test_ticket_status_update(self, test_client):
        ticket_id = "88888888-8888-8888-8888-888888888888"
        payload = {
            "status": "resolved",
            "assigned_agent": "Agent Johnson"
        }
        response = test_client.patch(f"/api/tickets/{ticket_id}", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "resolved"
        assert data["assigned_agent"] == "Agent Johnson"
        assert data["resolved_at"] is not None

    def test_conversation_creation(self, test_client):
        payload = {
            "customer_id": "11111111-1111-1111-1111-111111111111",
            "initial_message": "Hello, I would like to inquire about my order."
        }
        response = test_client.post("/api/conversations", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "ai_handling"
        assert data["customer_id"] == payload["customer_id"]

    def test_message_creation_ai_allowed_initially(self, test_client):
        conv_id = "66666666-6666-6666-6666-666666666666"
        payload = {
            "sender_type": "assistant",
            "content": "Hello! I am your AI support agent. How can I assist you today?"
        }
        response = test_client.post(f"/api/conversations/{conv_id}/messages", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["sender_type"] == "assistant"
        assert data["content"] == payload["content"]

    def test_human_takeover_and_ai_blocking(self, test_client):
        conv_id = "66666666-6666-6666-6666-666666666666"

        # 1. Human agent takes over
        takeover_res = test_client.post(
            f"/api/agents/takeover/{conv_id}",
            json={"agent_name": "Agent Marcus", "reason": "Customer requested human escalation"}
        )
        assert takeover_res.status_code == 200
        assert takeover_res.json()["status"] == "human_handling"

        # 2. Autonomous AI attempts to post message -> MUST BE BLOCKED (HTTP 403)
        ai_msg_payload = {
            "sender_type": "assistant",
            "content": "Autonomous message that should be rejected by takeover lock."
        }
        blocked_res = test_client.post(f"/api/conversations/{conv_id}/messages", json=ai_msg_payload)
        assert blocked_res.status_code == 403
        assert "human takeover" in blocked_res.json()["detail"].lower() or "blocked" in blocked_res.json()["detail"].lower()

        # 3. Human agent replies directly
        reply_res = test_client.post(
            f"/api/agents/conversations/{conv_id}/reply",
            json={"content": "Hi, I am Agent Marcus. I will handle your request personally.", "agent_name": "Agent Marcus"}
        )
        assert reply_res.status_code == 201
        assert reply_res.json()["sender_type"] == "human_agent"

        # 4. Release conversation back to AI
        release_res = test_client.post(f"/api/agents/release/{conv_id}", json={"agent_name": "Agent Marcus"})
        assert release_res.status_code == 200
        assert release_res.json()["status"] == "ai_handling"

        # 5. AI message should now be accepted again
        allowed_res = test_client.post(f"/api/conversations/{conv_id}/messages", json=ai_msg_payload)
        assert allowed_res.status_code == 201

    def test_knowledge_search(self, test_client):
        # Search for refund policy
        response = test_client.get("/api/knowledge/search?query=refund")
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == "refund"
        assert data["total_matches"] >= 1
        assert "refund" in data["results"][0]["title"].lower()

    def test_knowledge_search_gap_recording(self, test_client):
        # Search for something not in knowledge base
        unknown_q = "How do I teleport my parcel instantly to Mars?"
        response = test_client.get(f"/api/knowledge/search?query={unknown_q}")
        assert response.status_code == 200
        data = response.json()
        assert data["total_matches"] == 0
        assert data["recorded_gap"] is True

    def test_analytics_overview(self, test_client):
        response = test_client.get("/api/analytics/overview")
        assert response.status_code == 200
        data = response.json()
        assert "total_tickets" in data
        assert "open_tickets" in data
        assert "resolved_tickets" in data
        assert "pending_tickets" in data
        assert "sla_breached_tickets" in data
        assert "total_refunds" in data
        assert "resolution_rate" in data
