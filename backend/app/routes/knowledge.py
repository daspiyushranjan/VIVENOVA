import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.dependencies import verify_agent_access
from app.models import KnowledgeArticle, KnowledgeGap
from app.schemas import (
    KnowledgeArticleCreate,
    KnowledgeArticleOut,
    KnowledgeSearchResponse,
    KnowledgeSearchResult,
    KnowledgeGapOut,
)

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge Base"])


@router.get("/search", response_model=KnowledgeSearchResponse)
def search_knowledge(
    query: str = Query(..., min_length=2, description="Search terms for knowledge base"),
    record_gap_on_empty: bool = Query(True, description="Record in knowledge gaps if 0 results found"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """
    Search knowledge articles by matching keywords against titles and content.
    Returns:
      - Article ID
      - Article title
      - Relevant content
      - Article version
    If no relevant articles are found, automatically records the question in KNOWLEDGE_GAPS.
    """
    clean_query = query.strip()
    search_pattern = f"%{clean_query}%"

    articles = (
        db.query(KnowledgeArticle)
        .filter(
            or_(
                KnowledgeArticle.title.ilike(search_pattern),
                KnowledgeArticle.content.ilike(search_pattern),
            )
        )
        .limit(limit)
        .all()
    )

    results = []
    for art in articles:
        # Create a helpful excerpt/snippet
        content_lower = art.content.lower()
        idx = content_lower.find(clean_query.lower())
        if idx != -1:
            start = max(0, idx - 60)
            end = min(len(art.content), idx + len(clean_query) + 120)
            snippet = ("..." if start > 0 else "") + art.content[start:end].strip() + ("..." if end < len(art.content) else "")
        else:
            snippet = art.content[:160] + ("..." if len(art.content) > 160 else "")

        results.append(
            KnowledgeSearchResult(
                article_id=art.id,
                title=art.title,
                content=art.content,
                version=art.version,
                snippet=snippet,
            )
        )

    recorded_gap = False
    if len(results) == 0 and record_gap_on_empty:
        # Record into KNOWLEDGE_GAPS
        gap = KnowledgeGap(
            question=clean_query,
            status="open"
        )
        db.add(gap)
        db.commit()
        recorded_gap = True

    return KnowledgeSearchResponse(
        query=clean_query,
        total_matches=len(results),
        results=results,
        recorded_gap=recorded_gap,
    )


@router.post("/articles", response_model=KnowledgeArticleOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_agent_access)])
def create_article(article_in: KnowledgeArticleCreate, db: Session = Depends(get_db)):
    """Add a new article to the knowledge base (admin/agent protected)."""
    article = KnowledgeArticle(
        title=article_in.title.strip(),
        content=article_in.content.strip(),
        version=article_in.version,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return KnowledgeArticleOut.model_validate(article)


@router.get("/articles", response_model=List[KnowledgeArticleOut])
def list_articles(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Retrieve all published knowledge base articles."""
    articles = (
        db.query(KnowledgeArticle)
        .order_by(KnowledgeArticle.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [KnowledgeArticleOut.model_validate(a) for a in articles]


@router.get("/gaps", response_model=List[KnowledgeGapOut], dependencies=[Depends(verify_agent_access)])
def list_knowledge_gaps(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter gaps by status (open, reviewed, resolved)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Retrieve recorded knowledge gaps for administrator review."""
    query = db.query(KnowledgeGap)
    if status_filter:
        query = query.filter(KnowledgeGap.status == status_filter.lower())
    gaps = query.order_by(KnowledgeGap.created_at.desc()).offset(offset).limit(limit).all()
    return [KnowledgeGapOut.model_validate(g) for g in gaps]
