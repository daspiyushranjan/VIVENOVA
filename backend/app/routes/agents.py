import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import verify_agent_access
from app.models import Conversation, Message
from app.schemas import (
    AgentTakeoverRequest,
    AgentReleaseRequest,
    AgentReplyRequest,
    AgentActionResponse,
    MessageOut,
)

router = APIRouter(prefix="/api/agents", tags=["Human Agents"])


@router.post(
    "/takeover/{conversation_id}",
    response_model=AgentActionResponse,
    dependencies=[Depends(verify_agent_access)]
)
def takeover_conversation(
    conversation_id: uuid.UUID,
    takeover_in: AgentTakeoverRequest = AgentTakeoverRequest(),
    db: Session = Depends(get_db)
):
    """
    Takeover a customer conversation by a human support agent.
    Transitions status to 'human_handling' and blocks autonomous AI responses.
    """
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation with ID '{conversation_id}' not found."
        )

    agent_name = takeover_in.agent_name.strip()
    conversation.status = "human_handling"
    conversation.assigned_agent = agent_name
    conversation.updated_at = datetime.now(timezone.utc)

    # Post system message announcing takeover
    reason_text = f" Reason: {takeover_in.reason}" if takeover_in.reason else ""
    system_msg = Message(
        conversation_id=conversation.id,
        sender_type="system",
        content=f"Human support agent '{agent_name}' has taken over the conversation.{reason_text}",
    )
    db.add(system_msg)
    db.commit()

    return AgentActionResponse(
        success=True,
        conversation_id=conversation.id,
        status=conversation.status,
        assigned_agent=conversation.assigned_agent,
        message=f"Conversation successfully assigned to {agent_name}. AI responses are now locked."
    )


@router.post(
    "/release/{conversation_id}",
    response_model=AgentActionResponse,
    dependencies=[Depends(verify_agent_access)]
)
def release_conversation(
    conversation_id: uuid.UUID,
    release_in: AgentReleaseRequest = AgentReleaseRequest(),
    db: Session = Depends(get_db)
):
    """
    Release a human-handled conversation back to autonomous AI handling.
    Transitions status to 'ai_handling' and re-enables AI responses.
    """
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation with ID '{conversation_id}' not found."
        )

    prev_agent = conversation.assigned_agent or "Agent"
    conversation.status = "ai_handling"
    conversation.assigned_agent = None
    conversation.updated_at = datetime.now(timezone.utc)

    notes_text = f" Notes: {release_in.notes}" if release_in.notes else ""
    system_msg = Message(
        conversation_id=conversation.id,
        sender_type="system",
        content=f"Human agent '{prev_agent}' released the conversation back to AI handling.{notes_text}",
    )
    db.add(system_msg)
    db.commit()

    return AgentActionResponse(
        success=True,
        conversation_id=conversation.id,
        status=conversation.status,
        assigned_agent=None,
        message="Conversation successfully returned to AI handling."
    )


@router.post(
    "/conversations/{conversation_id}/reply",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_agent_access)]
)
def agent_reply(
    conversation_id: uuid.UUID,
    reply_in: AgentReplyRequest,
    db: Session = Depends(get_db)
):
    """
    Submit a reply from a human support agent directly to the customer.
    Automatically assigns conversation to human agent if not already assigned.
    """
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation with ID '{conversation_id}' not found."
        )

    if conversation.status != "human_handling":
        conversation.status = "human_handling"
        conversation.assigned_agent = reply_in.agent_name

    msg = Message(
        conversation_id=conversation.id,
        sender_type="human_agent",
        content=reply_in.content.strip(),
    )
    db.add(msg)
    conversation.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(msg)

    return MessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_type=msg.sender_type,
        content=msg.content,
        created_at=msg.created_at,
    )
