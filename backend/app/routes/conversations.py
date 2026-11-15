import uuid
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Conversation, Message, Customer
from app.schemas import (
    ConversationCreate,
    ConversationOut,
    MessageCreate,
    MessageOut,
)

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(conv_in: ConversationCreate, db: Session = Depends(get_db)):
    """Create a new customer conversation and optionally save an initial message."""
    customer = db.query(Customer).filter(Customer.id == conv_in.customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer with ID '{conv_in.customer_id}' not found."
        )

    conversation = Conversation(
        customer_id=conv_in.customer_id,
        status="ai_handling",
        assigned_agent=None,
    )
    db.add(conversation)
    db.flush()

    if conv_in.initial_message:
        msg = Message(
            conversation_id=conversation.id,
            sender_type="customer",
            content=conv_in.initial_message.strip(),
        )
        db.add(msg)

    db.commit()
    db.refresh(conversation)

    return ConversationOut(
        id=conversation.id,
        customer_id=conversation.customer_id,
        status=conversation.status,
        assigned_agent=conversation.assigned_agent,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages_count=1 if conv_in.initial_message else 0,
    )


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retrieve conversation metadata and status."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation with ID '{conversation_id}' not found."
        )
    return ConversationOut(
        id=conversation.id,
        customer_id=conversation.customer_id,
        status=conversation.status,
        assigned_agent=conversation.assigned_agent,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages_count=len(conversation.messages),
    )


@router.get("/{conversation_id}/messages", response_model=List[MessageOut])
def get_conversation_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Retrieve full chronological message history for a conversation."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation with ID '{conversation_id}' not found."
        )

    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        MessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            sender_type=m.sender_type,
            content=m.content,
            created_at=m.created_at,
        )
        for m in messages
    ]


@router.post("/{conversation_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def post_message(
    conversation_id: uuid.UUID,
    message_in: MessageCreate,
    db: Session = Depends(get_db)
):
    """
    Append a new message to the conversation.
    Enforces Human Takeover rule:
    When a human agent has taken over or is handling the conversation,
    prevent AI assistant responses from being accepted until the conversation is released.
    """
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation with ID '{conversation_id}' not found."
        )

    # Human Takeover Lock Check
    if conversation.status in ("human_handling", "waiting_for_human") and message_in.sender_type.value == "assistant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Conversation is currently in '{conversation.status}' mode assigned to human agent '{conversation.assigned_agent}'. "
                "Autonomous AI messages are blocked until a human agent releases the conversation back to AI handling."
            )
        )

    message = Message(
        conversation_id=conversation.id,
        sender_type=message_in.sender_type.value,
        content=message_in.content.strip(),
    )
    db.add(message)

    # Touch updated_at on conversation
    conversation.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(message)

    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_type=message.sender_type,
        content=message.content,
        created_at=message.created_at,
    )
