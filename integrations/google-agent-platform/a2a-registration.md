# Google Agent Platform A2A Registration

BazaarLens is a code-first TypeScript agent hosted at `api.bazaarlens.xyz`. Google Agent Platform / Gemini Enterprise can register it through Agent2Agent instead of hosting the BazaarLens code.

## Register The Agent

Use the hosted agent card:

```text
https://api.bazaarlens.xyz/.well-known/agent.json
```

Compatibility alias:

```text
https://api.bazaarlens.xyz/.well-known/agent-card.json
```

Use the hosted OpenAPI document when the Google UI asks for an API/tool contract:

```text
https://api.bazaarlens.xyz/openapi.json
```

Use the public submission profile when judges need a non-secret deployment summary:

```text
https://api.bazaarlens.xyz/.well-known/bazaarlens-submission.json
```

The card advertises:

- A Gemini Enterprise registration-compatible A2A card with `protocolVersion: "0.3"`
- `preferredTransport: "JSONRPC"` with Server-Sent Events streaming enabled
- JSON-RPC interface at `https://api.bazaarlens.xyz/a2a`
- HTTP+JSON interface at `https://api.bazaarlens.xyz/v1/message:send`
- HTTP+JSON streaming interface at `https://api.bazaarlens.xyz/v1/message:stream`
- HTTP+JSON task lookup at `https://api.bazaarlens.xyz/v1/tasks/{taskId}`
- Compatibility HTTP+JSON interface at `https://api.bazaarlens.xyz/a2a/message:send`
- `product-buying-check` skill for visible ecommerce product-page analysis
- API-key authentication through `x-bazaarlens-a2a-key`
- OpenAPI docs at `https://api.bazaarlens.xyz/docs`
- Safe metadata for judges and platform registration:
  - `modelProvider: "google-vertex"`
  - active `model`
  - `a2aProtocolVersion: "0.3"`
  - configured memory provider, when enabled
  - configured non-Mongo evidence providers, when enabled
  - supported stores and checkout safety boundary

The submission profile advertises the same URLs plus the selected track, Google Vertex model, configured memory provider, configured evidence providers, public connector status, supported stores, and blocked automation boundary. It does not expose connection strings, API keys, MCP headers, or host-specific service URLs.

## Google Cloud Setup

1. Open Gemini Enterprise / Google Agent Platform in Google Cloud.
2. Go to Agents and add a custom A2A agent.
3. Paste the JSON from `https://api.bazaarlens.xyz/.well-known/agent.json` into the Agent card JSON field. The card intentionally uses `protocolVersion: "0.3"` because Gemini Enterprise registration examples currently use A2A `0.3`.
4. Configure the auth header:
   - Header name: `x-bazaarlens-a2a-key`
   - Value: the deployment secret `A2A_AGENT_KEY`
5. If the UI asks for an API schema, paste `https://api.bazaarlens.xyz/openapi.json`.
6. Preview the agent with a structured product payload.

Google discovers the agent from the card and calls the live BazaarLens API. The NestJS app remains hosted on our server. If `AGENT_EVIDENCE_PROVIDERS` is empty, the card exposes only the selected configured track. If it is `all`, the card exposes every enabled and configured non-Mongo evidence source. If it is a comma list, production env validation requires each listed source to be runtime-ready before the API starts.

## Message Input

For the product check skill, send a `data` part or `metadata.analyzeRequest` matching the BazaarLens `AnalyzeRequest` shape. Plain text alone is not enough because BazaarLens only makes buying claims from visible product-page evidence.

Minimal HTTP+JSON message:

```json
{
  "message": {
    "messageId": "msg-1",
    "role": "ROLE_USER",
    "parts": [
      {
        "mediaType": "application/json",
        "data": {
          "page": {
            "url": "https://www.amazon.in/example/dp/B000000001",
            "merchant": "amazon",
            "title": "boAt Airdopes 141 Bluetooth TWS Earbuds",
            "price": { "amount": 1299, "currency": "INR", "raw": "Rs 1,299" },
            "mrp": null,
            "discountText": null,
            "rating": 4,
            "reviewCount": 4200,
            "seller": "Appario Retail Private Ltd",
            "availability": "In stock",
            "delivery": "Tomorrow",
            "returnPolicy": "7 days replacement",
            "selectedSize": null,
            "images": [],
            "breadcrumbs": ["Electronics", "Headphones"],
            "visibleText": "boAt Airdopes 141 Bluetooth TWS Earbuds Rs 1,299",
            "extractedAt": "2026-06-09T10:00:00.000Z"
          },
          "intent": {
            "query": "Should I buy this under Rs 1500?",
            "budget": 1500,
            "userContext": null
          }
        }
      }
    ]
  }
}
```

Send the payload to `POST https://api.bazaarlens.xyz/v1/message:send` with `Content-Type: application/a2a+json` and the configured `x-bazaarlens-a2a-key` header. The response is an A2A task with a structured BazaarLens decision artifact. Legacy aliases at `/message:send` and `/a2a/message:send` remain available for older clients.

For JSON-RPC clients, call `POST https://api.bazaarlens.xyz/a2a` with method `message/send` or `SendMessage`. Streaming clients can use `message/stream` or `SendStreamingMessage`; BazaarLens returns `text/event-stream` with the final task and terminal status update. `tasks/get` and `tasks/cancel` are implemented for completed BazaarLens task IDs. Compatibility alias `message:send` is also accepted.
