# DeskPilot — AI Agent Tool Integration Guide

This document defines the exact HTTP tool interfaces designed for the AI Agent teammate to interact with the DeskPilot Backend API.

All endpoints adhere to REST standards, accept and return JSON (`Content-Type: application/json`), and validate input using strict Pydantic schemas.

---

## Base URL

- **Local Development**: `http://localhost:8000`
- **Render Production**: `https://<your-render-app-name>.onrender.com`

---

## Tool 1: `get_order(order_number)`

Fetches order details, product information, customer UUID, amount, and fulfillment status.

- **HTTP Method**: `GET`
- **Endpoint**: `/api/orders/by-number/{order_number}`
- **Alternative**: `/api/orders?order_number={order_number}`

### Request Parameters

| Parameter | Location | Type | Required | Description |
|---|---|---|---|---|
| `order_number` | Path | string | Yes | The unique customer order number (e.g. `"ORD-1001"`) |

### Example Request

```http
GET /api/orders/by-number/ORD-1001 HTTP/1.1
Host: localhost:8000
Accept: application/json
```

### Example Success Response (`200 OK`)

```json
{
  "id": "22222222-2222-2222-2222-222222222222",
  "order_number": "ORD-1001",
  "customer_id": "11111111-1111-1111-1111-111111111111",
  "product_name": "Noise-Cancelling Headphones Pro",
  "amount": 199.99,
  "status": "delivered",
  "created_at": "2026-11-10T12:00:00Z"
}
```

### Error Responses
- `404 Not Found`: Order number does not exist.

---

## Tool 2: `check_refund(order_number, reason)`

Validates whether an order is eligible for a refund according to server-side business rules. **Never record or initiate a refund here; this is a non-destructive read check.**

- **HTTP Method**: `POST`
- **Endpoint**: `/api/refunds/check`

### Business Rules Evaluated
1. Order must exist.
2. Order status must be `delivered` or `cancelled`.
3. Order age cannot exceed 30 days.
4. Order must not already be fully refunded (`status != "refunded"`).
5. Requested refund amount cannot exceed remaining order balance.

### Example Request

```http
POST /api/refunds/check HTTP/1.1
Host: localhost:8000
Content-Type: application/json

{
  "order_number": "ORD-1001",
  "reason": "Left earcup produces static distortion on arrival."
}
```

### Example Success Response (`200 OK` — Eligible)

```json
{
  "eligible": true,
  "order_number": "ORD-1001",
  "order_id": "22222222-2222-2222-2222-222222222222",
  "order_status": "delivered",
  "order_amount": 199.99,
  "requested_amount": 199.99,
  "remaining_eligible_amount": 199.99,
  "reason": "Left earcup produces static distortion on arrival.",
  "message": "Order is eligible for a refund of $199.99."
}
```

### Example Response (`200 OK` — Ineligible)

```json
{
  "eligible": false,
  "order_number": "ORD-1002",
  "order_id": "33333333-3333-3333-3333-333333333333",
  "order_status": "delivered",
  "order_amount": 649.50,
  "requested_amount": 0.0,
  "remaining_eligible_amount": 0.0,
  "reason": "Buyer remorse",
  "message": "Order is 45 days old, exceeding the 30-day refund window."
}
```

---

## Tool 3: `initiate_refund(order_number, reason)`

Executes a simulated refund transaction. Protected by row-level locking (`with_for_update`) to prevent duplicate refund transactions.

- **HTTP Method**: `POST`
- **Endpoint**: `/api/refunds/initiate`

### Request Body

```json
{
  "order_number": "ORD-1001",
  "amount": 199.99,
  "reason": "Customer received defective headphones. Refund approved."
}
```

*Note: If `amount` is omitted, the system defaults to the full remaining eligible balance.*

### Example Success Response (`201 Created`)

```json
{
  "id": "99999999-9999-9999-9999-999999999999",
  "order_id": "22222222-2222-2222-2222-222222222222",
  "order_number": "ORD-1001",
  "amount": 199.99,
  "reason": "Customer received defective headphones. Refund approved.",
  "status": "completed",
  "created_at": "2026-11-15T12:40:00Z"
}
```

### Error Responses
- `400 Bad Request`: Ineligible (e.g., duplicate refund, order older than 30 days, or exceeding amount).
- `404 Not Found`: Order number not found.

---

## Tool 4: `create_ticket(customer_id, title, description, priority)`

Creates an AI-generated support ticket. The backend automatically computes the exact `sla_deadline` based on ticket priority.

- **HTTP Method**: `POST`
- **Endpoint**: `/api/tickets`

### SLA Targets

- `critical`: **5 minutes**
- `high`: **15 minutes**
- `medium`: **60 minutes**
- `low`: **240 minutes**

### Request Body

```json
{
  "customer_id": "11111111-1111-1111-1111-111111111111",
  "conversation_id": "66666666-6666-6666-6666-666666666666",
  "title": "Hardware Audio Distortion (ORD-1001)",
  "description": "Left earcup produces constant buzzing noise. Customer requested replacement or repair under warranty.",
  "priority": "high"
}
```

### Example Success Response (`201 Created`)

```json
{
  "id": "44444444-4444-4444-4444-444444444444",
  "customer_id": "11111111-1111-1111-1111-111111111111",
  "conversation_id": "66666666-6666-6666-6666-666666666666",
  "title": "Hardware Audio Distortion (ORD-1001)",
  "description": "Left earcup produces constant buzzing noise. Customer requested replacement or repair under warranty.",
  "priority": "high",
  "status": "open",
  "assigned_agent": null,
  "sla_deadline": "2026-11-15T12:55:00Z",
  "is_sla_breached": false,
  "minutes_to_sla_deadline": 15.0,
  "created_at": "2026-11-15T12:40:00Z",
  "resolved_at": null
}
```

---

## Tool 5: `search_knowledge(query)`

Searches published knowledge base articles by keyword matching against article titles and content.

**Knowledge Gap Recording**: If no articles match the query, the unanswered question is automatically saved to `KNOWLEDGE_GAPS` for human review.

- **HTTP Method**: `GET`
- **Endpoint**: `/api/knowledge/search?query={query}`

### Request Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search keyword(s) (min 2 chars) |
| `record_gap_on_empty` | boolean | No (Default: `true`) | Automatically records into `knowledge_gaps` if 0 matches |

### Example Request

```http
GET /api/knowledge/search?query=refund%20policy HTTP/1.1
Host: localhost:8000
```

### Example Success Response (`200 OK`)

```json
{
  "query": "refund policy",
  "total_matches": 1,
  "results": [
    {
      "article_id": "77777777-7777-7777-7777-777777777777",
      "title": "Standard 30-Day Refund & Return Policy",
      "content": "Customers may request a full or partial refund on eligible orders within 30 days of purchase...",
      "version": 1,
      "snippet": "...request a full or partial refund on eligible orders within 30 days of purchase..."
    }
  ],
  "recorded_gap": false
}
```

If no matches exist:
```json
{
  "query": "Can I return items to Mars?",
  "total_matches": 0,
  "results": [],
  "recorded_gap": true
}
```

---

## Tool 6: `get_conversation_history(conversation_id)`

Fetches the chronological message log for a customer support conversation.

- **HTTP Method**: `GET`
- **Endpoint**: `/api/conversations/{conversation_id}/messages`

### Example Request

```http
GET /api/conversations/66666666-6666-6666-6666-666666666666/messages HTTP/1.1
Host: localhost:8000
```

### Example Success Response (`200 OK`)

```json
[
  {
    "id": "a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1",
    "conversation_id": "66666666-6666-6666-6666-666666666666",
    "sender_type": "customer",
    "content": "Hello, my headphones arrived with audio static.",
    "created_at": "2026-11-15T12:00:00Z"
  },
  {
    "id": "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2",
    "conversation_id": "66666666-6666-6666-6666-666666666666",
    "sender_type": "assistant",
    "content": "I can help check your refund eligibility for order ORD-1001.",
    "created_at": "2026-11-15T12:01:00Z"
  }
]
```

---

## Tool 7: `request_human_takeover(conversation_id, reason)`

Escalates a conversation to human support staff. Switches status to `human_handling` and locks autonomous AI responses until human release.

- **HTTP Method**: `POST`
- **Endpoint**: `/api/agents/takeover/{conversation_id}`

### Request Body

```json
{
  "agent_name": "Senior Support Specialist",
  "reason": "Customer expressed frustration with automated responses and requested a live human supervisor."
}
```

### Example Success Response (`200 OK`)

```json
{
  "success": true,
  "conversation_id": "66666666-6666-6666-6666-666666666666",
  "status": "human_handling",
  "assigned_agent": "Senior Support Specialist",
  "message": "Conversation successfully assigned to Senior Support Specialist. AI responses are now locked."
}
```

### Human Takeover Protection Behavior

When a conversation is in `human_handling` or `waiting_for_human` mode:
Any attempt by the AI assistant to post a message via `POST /api/conversations/{conversation_id}/messages` with `sender_type="assistant"` will be rejected with:

```json
HTTP/1.1 403 Forbidden
{
  "detail": "Conversation is currently in 'human_handling' mode assigned to human agent 'Senior Support Specialist'. Autonomous AI messages are blocked until a human agent releases the conversation back to AI handling."
}
```

To resume AI responses after resolution:
Call `POST /api/agents/release/{conversation_id}`.
