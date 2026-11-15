from decimal import Decimal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Ticket, Refund
from app.schemas import AnalyticsOverview
from app.services.sla_service import evaluate_sla_status

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
def get_analytics_overview(db: Session = Depends(get_db)):
    """
    Computes real-time customer support metrics directly from actual database records:
      - Total tickets
      - Open tickets
      - Resolved tickets
      - Pending tickets
      - SLA-breached tickets
      - Total refunds count & amount
      - Resolution rate percentage
    """
    all_tickets = db.query(Ticket).all()
    total_tickets = len(all_tickets)

    open_tickets = 0
    resolved_tickets = 0
    pending_tickets = 0
    sla_breached_tickets = 0

    for t in all_tickets:
        if t.status == "open":
            open_tickets += 1
        elif t.status == "resolved":
            resolved_tickets += 1
        elif t.status == "pending":
            pending_tickets += 1

        is_breached, _ = evaluate_sla_status(t)
        if is_breached:
            sla_breached_tickets += 1

    # Refunds metrics
    refunds = db.query(Refund).filter(Refund.status == "completed").all()
    total_refunds = len(refunds)
    total_refunded_amount = sum(float(r.amount) for r in refunds)

    # Resolution rate
    resolution_rate = 0.0
    if total_tickets > 0:
        resolution_rate = round((resolved_tickets / total_tickets) * 100.0, 2)

    return AnalyticsOverview(
        total_tickets=total_tickets,
        open_tickets=open_tickets,
        resolved_tickets=resolved_tickets,
        pending_tickets=pending_tickets,
        sla_breached_tickets=sla_breached_tickets,
        total_refunds=total_refunds,
        total_refunded_amount=round(total_refunded_amount, 2),
        resolution_rate=resolution_rate,
    )
