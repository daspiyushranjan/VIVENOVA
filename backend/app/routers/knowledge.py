
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.knowledge_base import (
    add_documents,
    search_documents,
    get_document_count
)

router = APIRouter(
    prefix="/knowledge",
    tags=["Knowledge Base"]
)


class DocumentItem(BaseModel):
    id: str
    text: str
    source: str = "unknown"


class AddDocumentsRequest(BaseModel):
    documents: list[DocumentItem]


class SearchRequest(BaseModel):
    question: str
    top_k: int = Field(default=3, ge=1, le=10)


@router.post("/documents")
def upload_documents(request: AddDocumentsRequest):

    if not request.documents:
        raise HTTPException(
            status_code=400,
            detail="At least one document is required."
        )

    ids = [item.id for item in request.documents]
    documents = [item.text for item in request.documents]

    metadatas = [
        {"source": item.source}
        for item in request.documents
    ]

    try:
        count = add_documents(ids, documents, metadatas)

        return {
            "message": "Documents stored successfully.",
            "stored": count
        }

    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.post("/search")
def search_knowledge(request: SearchRequest):

    results = search_documents(
        question=request.question,
        top_k=request.top_k
    )

    return {
        "question": request.question,
        "results": results
    }


@router.get("/count")
def document_count():

    return {
        "total_documents": get_document_count()
    }
