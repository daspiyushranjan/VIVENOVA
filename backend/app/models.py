import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Text,
    Numeric,
    Integer,
    ForeignKey,
    DateTime,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


def get_utc_now():
    return datetime.now(timezone.utc)


class Customer(Base):
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    # Relationships
    orders = relationship("Order", back_populates="customer", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="customer", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="customer", cascade="all, delete-orphan")


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_number = Column(String(64), unique=True, index=True, nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    product_name = Column(String(255), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String(32), index=True, nullable=False)  # delivered, cancelled, processing, shipped, refunded
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    # Relationships
    customer = relationship("Customer", back_populates="orders")
    refunds = relationship("Refund", back_populates="order", cascade="all, delete-orphan")


class Refund(Base):
    __tablename__ = "refunds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(32), index=True, nullable=False, default="completed")  # completed, pending, failed
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    # Relationships
    order = relationship("Order", back_populates="refunds")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"), index=True, nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(String(16), index=True, nullable=False)  # critical, high, medium, low
    status = Column(String(32), index=True, nullable=False, default="open")  # open, pending, resolved
    assigned_agent = Column(String(255), nullable=True)
    sla_deadline = Column(DateTime(timezone=True), index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="tickets")
    conversation = relationship("Conversation", back_populates="tickets")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), index=True, nullable=False)
    status = Column(String(32), index=True, nullable=False, default="ai_handling")  # ai_handling, waiting_for_human, human_handling, resolved
    assigned_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now, nullable=False)

    # Relationships
    customer = relationship("Customer", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")
    tickets = relationship("Ticket", back_populates="conversation")


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False)
    sender_type = Column(String(32), index=True, nullable=False)  # customer, assistant, human_agent, system
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")


class KnowledgeArticle(Base):
    __tablename__ = "knowledge_articles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), index=True, nullable=False)
    content = Column(Text, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)


class KnowledgeGap(Base):
    __tablename__ = "knowledge_gaps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question = Column(Text, nullable=False)
    status = Column(String(32), index=True, default="open", nullable=False)  # open, reviewed, resolved
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
