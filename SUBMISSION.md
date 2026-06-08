# BazaarLens Hackathon Submission

## Devpost Fields

| Field | Value |
| --- | --- |
| Project name | BazaarLens |
| Hosted project | https://bazaarlens.xyz |
| API profile | https://api.bazaarlens.xyz/.well-known/bazaarlens-submission.json |
| Agent card | https://api.bazaarlens.xyz/.well-known/agent.json |
| Agent card alias | https://api.bazaarlens.xyz/.well-known/agent-card.json |
| OpenAPI | https://api.bazaarlens.xyz/openapi.json |
| MCP readiness | https://api.bazaarlens.xyz/ops/capabilities (authenticated; includes selected track and non-secret connector status) |
| A2A JSON-RPC | https://api.bazaarlens.xyz/a2a (`SendMessage`) |
| A2A HTTP+JSON | https://api.bazaarlens.xyz/message:send |
| Code repository | https://github.com/aryan877/bazaarlens (private during development; make public or grant judge access before submission review) |
| License | MIT, see `LICENSE` |
| Demo video | Pending final recording |
| Selected track | MongoDB |

## What Judges Should See

BazaarLens is an approval-gated shopping agent for Indian ecommerce. It extracts live product-page evidence from Amazon.in, Flipkart, and Myntra, asks Gemini for a structured buying decision, stores user-specific buying memory through MongoDB MCP, and allows only user-approved browser actions such as add-to-cart, wishlist, or comparison.

The product deliberately blocks checkout, payment, OTP, address-change, credential-entry, and final-order automation.

## Required Challenge Proof

| Requirement | Repo/runtime evidence |
| --- | --- |
| Functional agent beyond chat | Chrome extension + web console + `POST /agent/analyze` + approval endpoint. |
| Gemini-powered reasoning | `packages/agent` uses `@ai-sdk/google-vertex`; production env requires Google Vertex API key or project. |
| Google Agent Platform registration | A2A card at `/.well-known/agent.json` with `/.well-known/agent-card.json` compatibility, OpenAPI at `/openapi.json`, setup in `integrations/google-agent-platform/a2a-registration.md`. |
| Agent Builder import details | Public submission profile includes the A2A import URL, OpenAPI tool schema URL, and `x-bazaarlens-a2a-key` auth header name. |
| MCP-backed agent memory | MongoDB MCP-backed buying memory in `apps/api/src/modules/agent-memory`. |
| Selected-track readiness | `/ops/capabilities` returns `selectedTrack`, `selectedConnector`, and `selectedTrackQualified` from the same connector config used by runtime analysis. |
| Public selected-track proof | `/.well-known/bazaarlens-submission.json` includes `selectedTrackReadiness` without exposing secrets. |
| Real-world target | Indian ecommerce buying checks for Amazon.in, Flipkart, and Myntra. |
| User oversight | Mutating browser commands require stored agent decision plus explicit approval. |
| Public open-source license | MIT `LICENSE` at repo root. |

## Optional Evidence Paths

MongoDB is the primary submission path. Other partner systems are intentionally optional, env-gated connected systems:

- Elastic: product/deal evidence through Elastic Agent Builder MCP or Elasticsearch MCP.
- Arize Phoenix: trace, span, prompt, and evaluation evidence for the agent run.
- Fivetran: read-only account and connection inventory evidence for catalog/price data pipelines.
- GitLab: DevSecOps workflow evidence only when an OAuth-ready MCP session or proxy is configured.
- Dynatrace: runtime observability evidence through the Dynatrace MCP gateway.

They are not required for the primary MongoDB submission path.

## Verification Before Submit

Current deploy note: the VPS environment is prepared for A2A and local MongoDB agent memory, but the live API should not be redeployed until a real Google Vertex credential is set with `GOOGLE_VERTEX_API_KEY`, or with `GOOGLE_VERTEX_PROJECT` / `GOOGLE_CLOUD_PROJECT` plus application-default/service-account credentials.

```bash
pnpm verify
pnpm prod:check -- deploy/production.env
pnpm prod:caddy:validate -- deploy/production.env
BAZAARLENS_ENV_FILE=deploy/production.env docker compose --env-file deploy/production.env -f docker-compose.prod.yml config --quiet
pnpm smoke:live:web
pnpm smoke:sites
WXT_API_URL=https://api.bazaarlens.xyz pnpm extension:store:package:validate
```

For Google OAuth claims, also run:

```bash
REQUIRE_GOOGLE=1 pnpm smoke:live:web
```
