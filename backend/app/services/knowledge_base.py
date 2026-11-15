
from pathlib import Path
import chromadb

# Keep ChromaDB data inside the backend folder,
# regardless of where the server is started.
BASE_DIR = Path(__file__).resolve().parents[2]
CHROMA_PATH = BASE_DIR / "chroma_data"

# Connect to persistent local ChromaDB
client = chromadb.PersistentClient(
    path=str(CHROMA_PATH)
)

# Get or create our knowledge collection
collection = client.get_or_create_collection(
    name="deskpilot_knowledge"
)


def add_documents(ids, documents, metadatas=None):
    """Store or update documents in ChromaDB."""

    if not ids or not documents:
        raise ValueError("IDs and documents cannot be empty.")

    if len(ids) != len(documents):
        raise ValueError("Each document must have one ID.")

    if metadatas is not None and len(metadatas) != len(documents):
        raise ValueError("Each document must have one metadata entry.")

    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas
    )

    return len(documents)


def search_documents(question, top_k=3):
    """Find documents relevant to a user's question."""

    total_documents = collection.count()

    if total_documents == 0:
        return []

    results = collection.query(
        query_texts=[question],
        n_results=min(top_k, total_documents),
        include=["documents", "metadatas", "distances"]
    )

    formatted_results = []

    for i in range(len(results["ids"][0])):
        formatted_results.append({
            "id": results["ids"][0][i],
            "document": results["documents"][0][i],
            "metadata": results["metadatas"][0][i],
            "distance": results["distances"][0][i]
        })

    return formatted_results


def get_document_count():
    """Return the number of stored documents."""

    return collection.count()
