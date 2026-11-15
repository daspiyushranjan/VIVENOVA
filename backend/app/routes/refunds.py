import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Refund, Order
from app.schemas import (
    RefundCheckRequest,
    RefundCheckResponse,
    RefundInitiateRequest,
    RefundOut,
)
from app.services.refund_service import (
    check_refund_service,
    initiate_refund_service,
    RefundValidationError,
)

router = APIRouter(prefix="/api/refunds", tags=["Refunds"])


@router.post("/check", response_model=RefundCheckResponse)
def check_refund(request: RefundCheckRequest, db: Session = Depends(get_db)):
    """
    Check if an order is eligible for a refund according to all business rules.
    Does not initiate or record any refund.
    """
    if not request.order_number and not request.order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'order_number' or 'order_id' must be provided."
        )

    try:
        result = check_refund_service(
            db=db,
            order_number=request.order_number,
            order_id=request.order_id,
            requested_amount=request.amount,
            reason=request.reason,
        )
        return RefundCheckResponse(**result)
    except RefundValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/initiate", response_model=RefundOut, status_code=status.HTTP_201_CREATED)
def initiate_refund(request: RefundInitiateRequest, db: Session = Depends(get_db)):
    """
    Atomically validate and initiate a simulated refund.
    Protected by row-level locking to prevent duplicate transactions.
    """
    if not request.order_number and not request.order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'order_number' or 'order_id' must be provided."
        )

    try:
        refund = initiate_refund_service(
            db=db,
            order_number=request.order_number,
            order_id=request.order_id,
            requested_amount=request.amount,
            reason=request.reason,
        )
        return RefundOut(
            id=refund.id,
            order_id=refund.order_id,
            order_number=refund.order.order_number if refund.order else None,
            amount=float(refund.amount),
            reason=refund.reason,
            status=refund.status,
            created_at=refund.created_at,
        )
    except RefundValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("", response_model=List[RefundOut])
def list_refunds(
    order_id: Optional[uuid.UUID] = Query(None, description="Filter by order UUID"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by refund status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Retrieve all simulated refunds with optional filters."""
    query = db.query(Refund).join(Order, Refund.order_id == Order.id)
    if order_id:
        query = query.filter(Refund.order_id == order_id)
    if status_filter:
        query = query.filter(Refund.status == status_filter)

    refunds = query.order_by(Refund.created_at.desc()).offset(offset).limit(limit).all()
    return [
        RefundOut(
            id=r.id,
            order_id=r.order_id,
            order_number=r.order.order_number if r.order else None,
            amount=float(r.amount),
            reason=r.reason,
            status=r.status,
            created_at=r.created_at,
        )
        for r in refunds
    ]


@router.get("/{refund_id}", response_model=RefundOut)
def get_refund(refund_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retrieve a single refund by UUID."""
    refund = db.query(Refund).filter(Refund.id == refund_id).first()
    if not refund:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Refund with ID '{refund_id}' not found."
        )
    return RefundOut(
        id=refund.id,
        order_id=refund.order_id,
        order_number=refund.order.order_number if refund.order else None,
        amount=float(refund.amount),
        reason=refund.reason,
        status=refund.status,
        created_at=refund.created_at,
    )
