import logging
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session
from app.models import (
    Customer,
    Order,
    Refund,
    Ticket,
    Conversation,
    Message,
    KnowledgeArticle,
    KnowledgeGap,
)
from app.services.sla_service import calculate_sla_deadline

logger = logging.getLogger("deskpilot.seed")


def seed_demo_data(db: Session) -> bool:
    """
    Seeds initial realistic demo data if the database is currently empty.
    Returns True if data was seeded, False if already populated.
    """
    customer_count = db.query(Customer).count()
    if customer_count > 0:
        logger.info("Database already contains data (%d customers). Skipping seed.", customer_count)
        return False

    logger.info("Database is empty. Seeding realistic demo data for DeskPilot MVP...")
    now = datetime.now(timezone.utc)

    # 1. Customers
    sarah = Customer(
        id=uuid.uuid4(),
        name="Sarah Connor",
        email="sarah.connor@sky-shield.io",
        created_at=now - timedelta(days=60),
    )
    bruce = Customer(
        id=uuid.uuid4(),
        name="Bruce Wayne",
        email="bruce.wayne@wayne-enterprises.com",
        created_at=now - timedelta(days=90),
    )
    tony = Customer(
        id=uuid.uuid4(),
        name="Tony Stark",
        email="tony@stark-industries.com",
        created_at=now - timedelta(days=30),
    )
    peter = Customer(
        id=uuid.uuid4(),
        name="Peter Parker",
        email="peter.parker@dailybugle.net",
        created_at=now - timedelta(days=15),
    )

    db.add_all([sarah, bruce, tony, peter])
    db.flush()

    # 2. Orders
    # ORD-1001: Sarah - Delivered 5 days ago (ELIGIBLE FOR REFUND)
    ord_1001 = Order(
        id=uuid.uuid4(),
        order_number="ORD-1001",
        customer_id=sarah.id,
        product_name="Noise-Cancelling Headphones Pro",
        amount=Decimal("199.99"),
        status="delivered",
        created_at=now - timedelta(days=5),
    )
    # ORD-1002: Bruce - Delivered 45 days ago (INELIGIBLE: > 30 days)
    ord_1002 = Order(
        id=uuid.uuid4(),
        order_number="ORD-1002",
        customer_id=bruce.id,
        product_name="Ultra-Wide Gaming Monitor 34\"",
        amount=Decimal("649.50"),
        status="delivered",
        created_at=now - timedelta(days=45),
    )
    # ORD-1003: Tony - Processing 2 days ago (INELIGIBLE: not delivered/cancelled)
    ord_1003 = Order(
        id=uuid.uuid4(),
        order_number="ORD-1003",
        customer_id=tony.id,
        product_name="Mechanical Wireless Keyboard RGB",
        amount=Decimal("129.00"),
        status="processing",
        created_at=now - timedelta(days=2),
    )
    # ORD-1004: Peter - Cancelled 8 days ago (ELIGIBLE: cancelled order)
    ord_1004 = Order(
        id=uuid.uuid4(),
        order_number="ORD-1004",
        customer_id=peter.id,
        product_name="USB-C Fast Charging Hub 100W",
        amount=Decimal("49.99"),
        status="cancelled",
        created_at=now - timedelta(days=8),
    )
    # ORD-1005: Bruce - Refunded 12 days ago (INELIGIBLE: already refunded)
    ord_1005 = Order(
        id=uuid.uuid4(),
        order_number="ORD-1005",
        customer_id=bruce.id,
        product_name="Smart Fitness Watch V2",
        amount=Decimal("220.00"),
        status="refunded",
        created_at=now - timedelta(days=12),
    )

    db.add_all([ord_1001, ord_1002, ord_1003, ord_1004, ord_1005])
    db.flush()

    # 3. Existing Refund for ORD-1005
    ref_1005 = Refund(
        id=uuid.uuid4(),
        order_id=ord_1005.id,
        amount=Decimal("220.00"),
        reason="Device casing arrived with cosmetic scratch. Full refund granted.",
        status="completed",
        created_at=now - timedelta(days=11),
    )
    db.add(ref_1005)

    # 4. Conversations & Messages
    conv_sarah = Conversation(
        id=uuid.uuid4(),
        customer_id=sarah.id,
        status="ai_handling",
        assigned_agent=None,
        created_at=now - timedelta(hours=2),
        updated_at=now - timedelta(hours=1),
    )
    db.add(conv_sarah)
    db.flush()

    msg1 = Message(
        conversation_id=conv_sarah.id,
        sender_type="customer",
        content="Hi! I received my Noise-Cancelling Headphones Pro (ORD-1001) but the left earcup has static. Can I get a refund?",
        created_at=now - timedelta(hours=2),
    )
    msg2 = Message(
        conversation_id=conv_sarah.id,
        sender_type="assistant",
        content="Hello Sarah! I am sorry to hear that. I can verify your order ORD-1001 and guide you through the simulated refund procedure.",
        created_at=now - timedelta(hours=1, minutes=58),
    )
    db.add_all([msg1, msg2])

    # 5. Tickets with various SLA states
    # Ticket 1: High priority, open (15 min SLA, created 6 min ago -> remaining 9 min)
    t1_created = now - timedelta(minutes=6)
    ticket1 = Ticket(
        id=uuid.uuid4(),
        customer_id=sarah.id,
        conversation_id=conv_sarah.id,
        title="Headphones earcup static noise (ORD-1001)",
        description="Customer reports hardware distortion in left earcup of brand new headphones.",
        priority="high",
        status="open",
        assigned_agent=None,
        sla_deadline=calculate_sla_deadline(t1_created, "high"),
        created_at=t1_created,
    )

    # Ticket 2: Critical priority, open (5 min SLA, created 20 min ago -> SLA BREACHED)
    t2_created = now - timedelta(minutes=20)
    ticket2 = Ticket(
        id=uuid.uuid4(),
        customer_id=tony.id,
        title="Firmware update bricked smart device",
        description="Urgent: Device reboot loop immediately following v2.4 OTA update installation.",
        priority="critical",
        status="open",
        assigned_agent="Agent Smith",
        sla_deadline=calculate_sla_deadline(t2_created, "critical"),
        created_at=t2_created,
    )

    # Ticket 3: Medium priority, resolved within SLA
    t3_created = now - timedelta(days=1)
    ticket3 = Ticket(
        id=uuid.uuid4(),
        customer_id=bruce.id,
        title="Invoice address correction request",
        description="Requested VAT invoice update for corporate tax filing.",
        priority="medium",
        status="resolved",
        assigned_agent="Agent Jane",
        sla_deadline=calculate_sla_deadline(t3_created, "medium"),
        created_at=t3_created,
        resolved_at=t3_created + timedelta(minutes=35),
    )

    db.add_all([ticket1, ticket2, ticket3])

    # 6. Knowledge Articles
    kb1 = KnowledgeArticle(
        id=uuid.uuid4(),
        title="Standard 30-Day Refund & Return Policy",
        content=(
            "Customers may request a full or partial refund on eligible orders within 30 days of purchase. "
            "To qualify for a refund, the order must be marked as 'delivered' or 'cancelled'. "
            "Orders currently in 'processing' or 'shipped' status cannot be refunded until delivery is completed or the shipment cancelled. "
            "Refunds are simulated and finalized instantaneously to the original payment method upon approval."
        ),
        version=1,
        created_at=now - timedelta(days=20),
    )
    kb2 = KnowledgeArticle(
        id=uuid.uuid4(),
        title="Order Tracking and Shipping Times",
        content=(
            "Standard shipping takes 3-5 business days across continental regions. "
            "Expedited priority shipping delivers within 1-2 business days. "
            "Tracking numbers are generated automatically upon order fulfillment and sent via email."
        ),
        version=1,
        created_at=now - timedelta(days=20),
    )
    kb3 = KnowledgeArticle(
        id=uuid.uuid4(),
        title="Hardware Warranty & Defective Items",
        content=(
            "All hardware devices come with a 1-year manufacturer warranty covering defective parts and manufacturing faults. "
            "Accidental physical or water damage is excluded from standard warranty coverage."
        ),
        version=1,
        created_at=now - timedelta(days=18),
    )
    kb4 = KnowledgeArticle(
        id=uuid.uuid4(),
        title="Human Support Escalation Guidelines",
        content=(
            "If an autonomous AI assistant is unable to resolve a complex inquiry or if the customer specifically requests human assistance, "
            "the conversation status will transition to 'waiting_for_human' or 'human_handling'. "
            "During human takeover, autonomous AI responses are temporarily disabled to ensure consistent human communication."
        ),
        version=1,
        created_at=now - timedelta(days=15),
    )

    db.add_all([kb1, kb2, kb3, kb4])

    db.commit()
    logger.info("Demo data successfully seeded into database.")
    return True
