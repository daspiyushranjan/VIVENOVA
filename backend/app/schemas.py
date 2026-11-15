from __future__ import annotations
import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# --- Enums ---

class TicketPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TicketStatus(str, Enum):
    OPEN = "open"
    PENDING = "pending"
    RESOLVED = "resolved"


class ConversationStatus(str, Enum):
    AI_HANDLING = "ai_handling"
    WAITING_FOR_HUMAN = "waiting_for_human"
    HUMAN_HANDLING = "human_handling"
    RESOLVED = "resolved"


class SenderType(str, Enum):
    CUSTOMER = "customer"
    ASSISTANT = "assistant"
    HUMAN_AGENT = "human_agent"
    SYSTEM = "system"


# --- Customers ---

class CustomerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr


class CustomerCreate(CustomerBase):
    pass


class CustomerOut(CustomerBase):
    id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Orders ---

class OrderOut(BaseModel):
    id: uuid.UUID
    order_number: str
    customer_id: uuid.UUID
    product_name: str
    amount: float
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Refunds ---

class RefundCheckRequest(BaseModel):
    order_number: Optional[str] = Field(None, description="The order number (e.g. ORD-1001)")
    order_id: Optional[uuid.UUID] = Field(None, description="The order UUID")
    amount: Optional[float] = Field(None, gt=0, description="Amount to refund. If omitted, checks full eligible order amount.")
    reason: str = Field(..., min_length=2, max_length=1000, description="Customer-provided refund reason")


class RefundCheckResponse(BaseModel):
    eligible: bool
    order_number: str
    order_id: uuid.UUID
    order_status: str
    order_amount: float
    requested_amount: float
    remaining_eligible_amount: float
    reason: Optional[str] = None
    message: str


class RefundInitiateRequest(BaseModel):
    order_number: Optional[str] = Field(None, description="Order number")
    order_id: Optional[uuid.UUID] = Field(None, description="Order UUID")
    amount: Optional[float] = Field(None, gt=0, description="Amount to refund. Defaults to total remaining eligible amount.")
    reason: str = Field(..., min_length=2, max_length=1000, description="Refund justification reason")


class RefundOut(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    order_number: Optional[str] = None
    amount: float
    reason: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Tickets ---

class TicketCreate(BaseModel):
    customer_id: uuid.UUID
    conversation_id: Optional[uuid.UUID] = None
    title: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=5)
    priority: TicketPriority = TicketPriority.MEDIUM
    assigned_agent: Optional[str] = None


class TicketUpdate(BaseModel):
    status: Optional[TicketStatus] = None
    priority: Optional[TicketPriority] = None
    assigned_agent: Optional[str] = None


class TicketOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    conversation_id: Optional[uuid.UUID] = None
    title: str
    description: str
    priority: str
    status: str
    assigned_agent: Optional[str] = None
    sla_deadline: datetime
    is_sla_breached: bool
    minutes_to_sla_deadline: float
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# --- Messages & Conversations ---

class MessageCreate(BaseModel):
    sender_type: SenderType
    content: str = Field(..., min_length=1, max_length=10000)


class MessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_type: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationCreate(BaseModel):
    customer_id: uuid.UUID
    initial_message: Optional[str] = None


class ConversationOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    status: str
    assigned_agent: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


# --- Agent Takeover & Release ---

class AgentTakeoverRequest(BaseModel):
    agent_name: str = Field("Agent", min_length=1, max_length=255)
    reason: Optional[str] = Field(None, max_length=1000)


class AgentReleaseRequest(BaseModel):
    agent_name: Optional[str] = "Agent"
    notes: Optional[str] = None


class AgentReplyRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)
    agent_name: Optional[str] = "Support Agent"


class AgentActionResponse(BaseModel):
    success: bool
    conversation_id: uuid.UUID
    status: str
    assigned_agent: Optional[str] = None
    message: str


# --- Knowledge Base ---

class KnowledgeArticleCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    content: str = Field(..., min_length=5)
    version: int = Field(1, ge=1)


class KnowledgeArticleOut(BaseModel):
    id: uuid.UUID
    title: str
    content: str
    version: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KnowledgeSearchResult(BaseModel):
    article_id: uuid.UUID
    title: str
    content: str
    version: int
    snippet: str

    model_config = ConfigDict(from_attributes=True)


class KnowledgeSearchResponse(BaseModel):
    query: str
    total_matches: int
    results: List[KnowledgeSearchResult]
    recorded_gap: bool = False


class KnowledgeGapOut(BaseModel):
    id: uuid.UUID
    question: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Analytics ---

class AnalyticsOverview(BaseModel):
    total_tickets: int
    open_tickets: int
    resolved_tickets: int
    pending_tickets: int
    sla_breached_tickets: int
    total_refunds: int
    total_refunded_amount: float
    resolution_rate: float


# --- Health ---

class HealthResponse(BaseModel):
    status: str
    database: str
    database_type: str
    message: Optional[str] = None
