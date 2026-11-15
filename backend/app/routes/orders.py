import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Order
from app.schemas import OrderOut

router = APIRouter(prefix="/api/orders", tags=["Orders"])


@router.get("", response_model=List[OrderOut])
def list_orders(
    customer_id: Optional[uuid.UUID] = Query(None, description="Filter by customer UUID"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (e.g. delivered, cancelled)"),
    order_number: Optional[str] = Query(None, description="Filter by order number"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Retrieve list of orders with optional filtering."""
    query = db.query(Order)
    if customer_id:
        query = query.filter(Order.customer_id == customer_id)
    if status_filter:
        query = query.filter(Order.status == status_filter)
    if order_number:
        query = query.filter(Order.order_number == order_number.strip())

    orders = query.order_by(Order.created_at.desc()).offset(offset).limit(limit).all()
    return [
        OrderOut(
            id=o.id,
            order_number=o.order_number,
            customer_id=o.customer_id,
            product_name=o.product_name,
            amount=float(o.amount),
            status=o.status,
            created_at=o.created_at
        )
        for o in orders
    ]


@router.get("/by-number/{order_number}", response_model=OrderOut)
def get_order_by_number(order_number: str, db: Session = Depends(get_db)):
    """Retrieve an order by its unique order number."""
    order = db.query(Order).filter(Order.order_number == order_number.strip()).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with order number '{order_number}' not found."
        )
    return OrderOut(
        id=order.id,
        order_number=order.order_number,
        customer_id=order.customer_id,
        product_name=order.product_name,
        amount=float(order.amount),
        status=order.status,
        created_at=order.created_at
    )


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retrieve an order by its UUID."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID '{order_id}' not found."
        )
    return OrderOut(
        id=order.id,
        order_number=order.order_number,
        customer_id=order.customer_id,
        product_name=order.product_name,
        amount=float(order.amount),
        status=order.status,
        created_at=order.created_at
    )
