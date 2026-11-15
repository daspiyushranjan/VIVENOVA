import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest

from app.models import Order, Refund, Ticket
from app.services.refund_service import (
    validate_refund_eligibility,
    MAX_REFUND_DAYS,
)
from app.services.sla_service import (
    calculate_sla_deadline,
    evaluate_sla_status,
    get_sla_minutes,
    SLA_TARGETS_MINUTES,
)


def create_mock_order(
    status="delivered",
    amount="100.00",
    days_ago=5,
    refunds=None
):
    """Helper to instantiate mock Order instance for business rule tests."""
    now = datetime.now(timezone.utc)
    order = Order(
        id=uuid.uuid4(),
        order_number="ORD-TEST-01",
        customer_id=uuid.uuid4(),
        product_name="Test Product",
        amount=Decimal(amount),
        status=status,
        created_at=now - timedelta(days=days_ago),
    )
    order.refunds = refunds or []
    return order


class TestRefundBusinessRules:
    """Rigorous tests for all refund business rules."""

    def test_delivered_order_within_30_days_is_eligible(self):
        order = create_mock_order(status="delivered", amount="150.00", days_ago=10)
        is_eligible, msg, final_amt, remaining = validate_refund_eligibility(order)
        assert is_eligible is True
        assert final_amt == Decimal("150.00")
        assert remaining == Decimal("150.00")

    def test_cancelled_order_within_30_days_is_eligible(self):
        order = create_mock_order(status="cancelled", amount="75.50", days_ago=3)
        is_eligible, msg, final_amt, remaining = validate_refund_eligibility(order)
        assert is_eligible is True
        assert final_amt == Decimal("75.50")

    def test_processing_order_is_ineligible(self):
        order = create_mock_order(status="processing", amount="100.00", days_ago=2)
        is_eligible, msg, _, _ = validate_refund_eligibility(order)
        assert is_eligible is False
        assert "ineligible" in msg.lower()
        assert "processing" in msg.lower()

    def test_shipped_order_is_ineligible(self):
        order = create_mock_order(status="shipped", amount="100.00", days_ago=2)
        is_eligible, msg, _, _ = validate_refund_eligibility(order)
        assert is_eligible is False
        assert "ineligible" in msg.lower()

    def test_order_older_than_30_days_is_ineligible(self):
        order = create_mock_order(status="delivered", amount="100.00", days_ago=35)
        is_eligible, msg, _, _ = validate_refund_eligibility(order)
        assert is_eligible is False
        assert "30-day" in msg.lower() or "days old" in msg.lower()

    def test_already_refunded_status_is_ineligible(self):
        order = create_mock_order(status="refunded", amount="100.00", days_ago=5)
        is_eligible, msg, _, _ = validate_refund_eligibility(order)
        assert is_eligible is False
        assert "already been fully refunded" in msg.lower()

    def test_partial_refund_calculation(self):
        now = datetime.now(timezone.utc)
        order = create_mock_order(status="delivered", amount="200.00", days_ago=4)
        # 1 previous refund of $80
        existing_ref = Refund(
            id=uuid.uuid4(),
            order_id=order.id,
            amount=Decimal("80.00"),
            reason="Partial return",
            status="completed",
            created_at=now - timedelta(days=2),
        )
        order.refunds = [existing_ref]

        # Remaining eligible should be 120.00
        is_eligible, msg, final_amt, remaining = validate_refund_eligibility(order)
        assert is_eligible is True
        assert remaining == Decimal("120.00")
        assert final_amt == Decimal("120.00")

    def test_cannot_exceed_order_amount(self):
        order = create_mock_order(status="delivered", amount="100.00", days_ago=5)
        is_eligible, msg, _, remaining = validate_refund_eligibility(order, requested_amount=150.00)
        assert is_eligible is False
        assert "exceeds" in msg.lower()
        assert remaining == Decimal("100.00")

    def test_zero_or_negative_refund_amount_rejected(self):
        order = create_mock_order(status="delivered", amount="100.00", days_ago=5)
        is_eligible, msg, _, _ = validate_refund_eligibility(order, requested_amount=0.00)
        assert is_eligible is False
        assert "greater than zero" in msg.lower()


class TestSLAManagement:
    """Tests for SLA target computation and breach detection."""

    def test_sla_targets_mapping(self):
        assert SLA_TARGETS_MINUTES["critical"] == 5
        assert SLA_TARGETS_MINUTES["high"] == 15
        assert SLA_TARGETS_MINUTES["medium"] == 60
        assert SLA_TARGETS_MINUTES["low"] == 240

    def test_calculate_sla_deadlines(self):
        now = datetime.now(timezone.utc)
        crit_dl = calculate_sla_deadline(now, "critical")
        assert (crit_dl - now) == timedelta(minutes=5)

        high_dl = calculate_sla_deadline(now, "high")
        assert (high_dl - now) == timedelta(minutes=15)

        med_dl = calculate_sla_deadline(now, "medium")
        assert (med_dl - now) == timedelta(minutes=60)

        low_dl = calculate_sla_deadline(now, "low")
        assert (low_dl - now) == timedelta(minutes=240)

    def test_sla_breach_detection_open_ticket(self):
        now = datetime.now(timezone.utc)
        # Ticket created 10 minutes ago with critical priority (5 min SLA)
        t_created = now - timedelta(minutes=10)
        t_deadline = calculate_sla_deadline(t_created, "critical")

        ticket = Ticket(
            id=uuid.uuid4(),
            customer_id=uuid.uuid4(),
            title="Breached Ticket",
            description="Testing SLA breach",
            priority="critical",
            status="open",
            sla_deadline=t_deadline,
            created_at=t_created,
        )

        is_breached, minutes_remaining = evaluate_sla_status(ticket, now=now)
        assert is_breached is True
        assert minutes_remaining < 0  # Overdue

    def test_sla_not_breached_open_ticket(self):
        now = datetime.now(timezone.utc)
        # Ticket created 2 minutes ago with critical priority (5 min SLA)
        t_created = now - timedelta(minutes=2)
        t_deadline = calculate_sla_deadline(t_created, "critical")

        ticket = Ticket(
            id=uuid.uuid4(),
            customer_id=uuid.uuid4(),
            title="Active Ticket",
            description="Testing SLA unbreached",
            priority="critical",
            status="open",
            sla_deadline=t_deadline,
            created_at=t_created,
        )

        is_breached, minutes_remaining = evaluate_sla_status(ticket, now=now)
        assert is_breached is False
        assert minutes_remaining > 0  # Still has ~3 minutes

    def test_sla_breach_on_resolved_ticket(self):
        now = datetime.now(timezone.utc)
        t_created = now - timedelta(hours=2)
        t_deadline = calculate_sla_deadline(t_created, "high")  # 15 minutes
        t_resolved = t_created + timedelta(minutes=30)  # Resolved after 30 min -> breached

        ticket = Ticket(
            id=uuid.uuid4(),
            customer_id=uuid.uuid4(),
            title="Resolved Breached Ticket",
            description="Testing SLA on resolved",
            priority="high",
            status="resolved",
            sla_deadline=t_deadline,
            created_at=t_created,
            resolved_at=t_resolved,
        )

        is_breached, minutes_diff = evaluate_sla_status(ticket, now=now)
        assert is_breached is True
        assert minutes_diff < 0
