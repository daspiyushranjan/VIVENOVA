
import chromadb

try:
    print("STEP 1: Connecting to ChromaDB...")

    client = chromadb.PersistentClient(path="./chroma_data")

    print("STEP 2: Creating collection...")

    collection = client.get_or_create_collection(
        name="deskpilot_knowledge"
    )

    print("STEP 3: Adding documents...")

    collection.upsert(
        ids=["policy_1", "policy_2", "policy_3"],
        documents=[
            "Customers can return unused products within 7 days.",
            "Refunds take 5 to 7 business days after approval.",
            "Standard shipping takes 3 to 5 business days."
        ]
    )

    print("STEP 4: Documents added!")

    print("STEP 5: Searching...")

    results = collection.query(
        query_texts=["Can I return my product?"],
        n_results=2
    )

    print("STEP 6: Search completed!")
    print(results)

    print("TOTAL DOCUMENTS:", collection.count())

except Exception as e:
    print("ERROR OCCURRED:")
    print(repr(e))
