from datetime import datetime, timedelta, timezone
from typing import Tuple, Optional
from app.models import Ticket

SLA_TARGETS_MINUTES = {
    "critical": 5,
    "high": 15,
    "medium": 60,
    "low": 240,
}

DEFAULT_SLA_MINUTES = 60


def get_sla_minutes(priority: str) -> int:
    """Return target SLA minutes for a given priority."""
    return SLA_TARGETS_MINUTES.get(priority.lower(), DEFAULT_SLA_MINUTES)


def calculate_sla_deadline(created_at: datetime, priority: str) -> datetime:
    """
    Calculate SLA deadline based on ticket creation timestamp and priority.
    Targets:
      - critical: 5 minutes
      - high: 15 minutes
      - medium: 60 minutes
      - low: 240 minutes
    """
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    sla_minutes = get_sla_minutes(priority)
    return created_at + timedelta(minutes=sla_minutes)


def evaluate_sla_status(ticket: Ticket, now: Optional[datetime] = None) -> Tuple[bool, float]:
    """
    Evaluates whether a ticket is SLA breached and returns:
      - is_sla_breached (bool)
      - minutes_to_sla_deadline (float: positive = minutes remaining, negative = minutes breached)
    """
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    sla_deadline = ticket.sla_deadline
    if sla_deadline.tzinfo is None:
        sla_deadline = sla_deadline.replace(tzinfo=timezone.utc)

    # If ticket was resolved, compare resolution time to deadline
    if ticket.status == "resolved" and ticket.resolved_at:
        resolved_at = ticket.resolved_at
        if resolved_at.tzinfo is None:
            resolved_at = resolved_at.replace(tzinfo=timezone.utc)
        is_breached = resolved_at > sla_deadline
        # Time remaining at resolution point
        diff = (sla_deadline - resolved_at).total_seconds() / 60.0
        return is_breached, round(diff, 2)

    # For unresolved/open/pending tickets, compare current time to deadline
    diff = (sla_deadline - now).total_seconds() / 60.0
    is_breached = now > sla_deadline
    return is_breached, round(diff, 2)
