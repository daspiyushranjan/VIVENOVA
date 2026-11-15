import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Ticket, Customer, Conversation
from app.schemas import TicketCreate, TicketUpdate, TicketOut
from app.services.sla_service import calculate_sla_deadline, evaluate_sla_status

router = APIRouter(prefix="/api/tickets", tags=["Tickets"])


def serialize_ticket(ticket: Ticket) -> TicketOut:
    """Helper to convert Ticket ORM model to TicketOut schema with dynamic SLA calculation."""
    is_breached, minutes_remaining = evaluate_sla_status(ticket)
    return TicketOut(
        id=ticket.id,
        customer_id=ticket.customer_id,
        conversation_id=ticket.conversation_id,
        title=ticket.title,
        description=ticket.description,
        priority=ticket.priority,
        status=ticket.status,
        assigned_agent=ticket.assigned_agent,
        sla_deadline=ticket.sla_deadline,
        is_sla_breached=is_breached,
        minutes_to_sla_deadline=minutes_remaining,
        created_at=ticket.created_at,
        resolved_at=ticket.resolved_at,
    )


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(ticket_in: TicketCreate, db: Session = Depends(get_db)):
    """
    Create a new support ticket.
    Automatically computes SLA deadline based on priority:
      - critical: 5 minutes
      - high: 15 minutes
      - medium: 60 minutes
      - low: 240 minutes
    """
    # Verify customer exists
    customer = db.query(Customer).filter(Customer.id == ticket_in.customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID '{ticket_in.customer_id}' not found."
        )

    # Verify conversation if provided
    if ticket_in.conversation_id:
        conv = db.query(Conversation).filter(Conversation.id == ticket_in.conversation_id).first()
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Conversation with ID '{ticket_in.conversation_id}' not found."
            )

    now = datetime.now(timezone.utc)
    sla_deadline = calculate_sla_deadline(now, ticket_in.priority.value)

    ticket = Ticket(
        customer_id=ticket_in.customer_id,
        conversation_id=ticket_in.conversation_id,
        title=ticket_in.title,
        description=ticket_in.description,
        priority=ticket_in.priority.value,
        status="open",
        assigned_agent=ticket_in.assigned_agent,
        sla_deadline=sla_deadline,
        created_at=now,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket)


@router.get("", response_model=List[TicketOut])
def list_tickets(
    customer_id: Optional[uuid.UUID] = Query(None, description="Filter by customer UUID"),
    conversation_id: Optional[uuid.UUID] = Query(None, description="Filter by conversation UUID"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (open, pending, resolved)"),
    priority_filter: Optional[str] = Query(None, alias="priority", description="Filter by priority (critical, high, medium, low)"),
    is_breached_only: Optional[bool] = Query(False, description="Filter only tickets that breached SLA"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Retrieve tickets with dynamic SLA indicators and filtering."""
    query = db.query(Ticket)
    if customer_id:
        query = query.filter(Ticket.customer_id == customer_id)
    if conversation_id:
        query = query.filter(Ticket.conversation_id == conversation_id)
    if status_filter:
        query = query.filter(Ticket.status == status_filter.lower())
    if priority_filter:
        query = query.filter(Ticket.priority == priority_filter.lower())

    tickets = query.order_by(Ticket.created_at.desc()).offset(offset).limit(limit).all()
    serialized = [serialize_ticket(t) for t in tickets]

    if is_breached_only:
        serialized = [t for t in serialized if t.is_sla_breached]

    return serialized


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retrieve details of a single ticket."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket with ID '{ticket_id}' not found."
        )
    return serialize_ticket(ticket)


@router.patch("/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: uuid.UUID, update_in: TicketUpdate, db: Session = Depends(get_db)):
    """Update ticket status, priority, or assigned agent."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticket with ID '{ticket_id}' not found."
        )

    if update_in.priority:
        ticket.priority = update_in.priority.value
        # Recalculate deadline if ticket is still open
        if ticket.status != "resolved":
            ticket.sla_deadline = calculate_sla_deadline(ticket.created_at, ticket.priority)

    if update_in.assigned_agent is not None:
        ticket.assigned_agent = update_in.assigned_agent

    if update_in.status:
        new_status = update_in.status.value
        ticket.status = new_status
        if new_status == "resolved" and not ticket.resolved_at:
            ticket.resolved_at = datetime.now(timezone.utc)
        elif new_status != "resolved":
            ticket.resolved_at = None

    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket)
