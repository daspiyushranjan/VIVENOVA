from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Tuple, Union
import uuid

from sqlalchemy.orm import Session
from app.models import Order, Refund


MAX_REFUND_DAYS = 30
ELIGIBLE_ORDER_STATUSES = {"delivered", "cancelled"}


class RefundValidationError(Exception):
    """Exception raised when a refund operation fails business validation."""
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def find_order(
    db: Session,
    order_number: Optional[str] = None,
    order_id: Optional[Union[uuid.UUID, str]] = None,
    for_update: bool = False
) -> Optional[Order]:
    """Helper to locate order by number or ID, optionally locking row."""
    query = db.query(Order)
    if for_update:
        query = query.with_for_update()

    if order_number:
        return query.filter(Order.order_number == order_number.strip()).first()
    if order_id:
        if isinstance(order_id, str):
            try:
                order_id = uuid.UUID(order_id)
            except ValueError:
                return None
        return query.filter(Order.id == order_id).first()
    return None


def validate_refund_eligibility(
    order: Order,
    requested_amount: Optional[float] = None,
    now: Optional[datetime] = None
) -> Tuple[bool, str, Decimal, Decimal]:
    """
    Pure validation function checking all business rules.
    Returns:
      (is_eligible: bool, message: str, final_amount: Decimal, remaining_eligible: Decimal)
    """
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    order_created_at = order.created_at
    if order_created_at.tzinfo is None:
        order_created_at = order_created_at.replace(tzinfo=timezone.utc)

    order_amount = Decimal(str(order.amount))

    # 1. Already fully refunded status rule
    if order.status.lower() == "refunded":
        return (
            False,
            "Order has already been fully refunded.",
            Decimal(0),
            Decimal(0),
        )

    # 2. Status rule: Only delivered or cancelled orders are eligible
    if order.status.lower() not in ELIGIBLE_ORDER_STATUSES:
        return (
            False,
            f"Order status '{order.status}' is ineligible. Only delivered or cancelled orders can be refunded.",
            Decimal(0),
            Decimal(0),
        )

    # 3. 30-day age rule: Orders older than 30 days are ineligible
    age = now - order_created_at
    if age > timedelta(days=MAX_REFUND_DAYS):
        return (
            False,
            f"Order is {age.days} days old, exceeding the 30-day refund window.",
            Decimal(0),
            Decimal(0),
        )

    # 4. Check existing completed refunds sum
    existing_refunded = Decimal(0)
    for r in order.refunds:
        if r.status == "completed":
            existing_refunded += Decimal(str(r.amount))

    remaining_eligible = order_amount - existing_refunded
    if remaining_eligible <= Decimal(0):
        return (
            False,
            "Order has already been fully refunded across previous refund transactions.",
            Decimal(0),
            Decimal(0),
        )

    # 5. Check requested amount
    if requested_amount is None:
        refund_amount = remaining_eligible
    else:
        req_dec = Decimal(str(round(requested_amount, 2)))
        if req_dec <= Decimal(0):
            return (
                False,
                "Refund amount must be greater than zero.",
                Decimal(0),
                remaining_eligible,
            )
        if req_dec > remaining_eligible:
            return (
                False,
                f"Requested amount (${req_dec:.2f}) exceeds remaining eligible amount (${remaining_eligible:.2f}).",
                Decimal(0),
                remaining_eligible,
            )
        refund_amount = req_dec

    return (
        True,
        f"Order is eligible for a refund of ${refund_amount:.2f}.",
        refund_amount,
        remaining_eligible,
    )


def check_refund_service(
    db: Session,
    order_number: Optional[str] = None,
    order_id: Optional[Union[uuid.UUID, str]] = None,
    requested_amount: Optional[float] = None,
    reason: str = ""
) -> dict:
    """
    Checks refund eligibility without executing any modification.
    """
    order = find_order(db, order_number=order_number, order_id=order_id, for_update=False)
    if not order:
        raise RefundValidationError(f"Order not found for number '{order_number}' or ID '{order_id}'.", status_code=404)

    is_eligible, message, final_amount, remaining_eligible = validate_refund_eligibility(
        order=order,
        requested_amount=requested_amount
    )

    return {
        "eligible": is_eligible,
        "order_number": order.order_number,
        "order_id": order.id,
        "order_status": order.status,
        "order_amount": float(order.amount),
        "requested_amount": float(final_amount) if is_eligible else (requested_amount or 0.0),
        "remaining_eligible_amount": float(remaining_eligible),
        "reason": reason,
        "message": message,
    }


def initiate_refund_service(
    db: Session,
    order_number: Optional[str] = None,
    order_id: Optional[Union[uuid.UUID, str]] = None,
    requested_amount: Optional[float] = None,
    reason: str = ""
) -> Refund:
    """
    Atomically processes a simulated refund using row locking (with_for_update)
    to guarantee no duplicate refund transactions can occur simultaneously.
    """
    # 1. Lock the order row to ensure exclusive transaction execution
    order = find_order(db, order_number=order_number, order_id=order_id, for_update=True)
    if not order:
        raise RefundValidationError(f"Order not found for number '{order_number}' or ID '{order_id}'.", status_code=404)

    # 2. Re-validate eligibility under lock
    is_eligible, message, final_amount, remaining_eligible = validate_refund_eligibility(
        order=order,
        requested_amount=requested_amount
    )
    if not is_eligible:
        raise RefundValidationError(message, status_code=400)

    # 3. Create simulated refund record
    refund = Refund(
        order_id=order.id,
        amount=final_amount,
        reason=reason,
        status="completed"
    )
    db.add(refund)

    # 4. Update order status if fully refunded
    if (final_amount >= remaining_eligible):
        order.status = "refunded"

    db.commit()
    db.refresh(refund)
    return refund
