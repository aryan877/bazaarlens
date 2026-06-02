const apiUrl = stripTrailingSlash(process.env.API_URL ?? "https://api.bazaarlens.xyz");
const a2aKey = process.env.A2A_AGENT_KEY?.trim() ?? "";
const requireAuth = process.env.REQUIRE_A2A_AUTH === "1";

const publicChecks = await runPublicChecks();
const authChecks = a2aKey ? await runAuthenticatedChecks() : null;

if (requireAuth && !authChecks) {
  throw new Error("REQUIRE_A2A_AUTH=1 expects A2A_AGENT_KEY to be set");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      apiUrl,
      publicChecks,
      authenticated: Boolean(authChecks),
      authChecks,
    },
    null,
    2,
  ),
);

async function runPublicChecks() {
  const [card, submission, openapi] = await Promise.all([
    readJson("/.well-known/agent.json"),
    readJson("/.well-known/bazaarlens-submission.json"),
    readJson("/openapi.json"),
  ]);

  assert(card.name === "BazaarLens", "agent card should name BazaarLens");
  assert(card.protocolVersion === "0.3", "agent card should publish A2A protocolVersion 0.3");
  assert(card.preferredTransport === "JSONRPC", "agent card should prefer JSONRPC");
  assert(card.capabilities?.streaming === true, "agent card should advertise streaming");
  assert(card.securitySchemes?.bazaarlensA2aKey?.name === "x-bazaarlens-a2a-key", "agent card should document A2A key header");
  assert(hasInterface(card, "/a2a"), "agent card should expose JSON-RPC /a2a");
  assert(hasInterface(card, "/v1/message:send"), "agent card should expose HTTP+JSON /v1/message:send");
  assert(card.metadata?.modelProvider === "google-vertex", "agent card should publish Google Vertex model provider");

  assert(submission.name === "BazaarLens", "submission profile should name BazaarLens");
  assert(submission.qualification?.poweredByGemini === true, "submission profile should mark Gemini-powered qualification");
  assert(submission.qualification?.googleAgentPlatformSurface === true, "submission profile should mark Agent Platform surface");
  assert(submission.selectedTrackReadiness?.provider === submission.selectedTrack, "submission profile should publish selected track readiness");
  assert(typeof submission.selectedTrackReadiness?.qualified === "boolean", "selected track readiness should publish a qualified boolean");
  assert(submission.selectedTrackReadiness?.runtimePath, "selected track readiness should publish the runtime path");
  assert(submission.selectedTrackReadiness?.mcpServer?.sourceUrl, "selected track readiness should publish MCP server source URL");
  assert(
    Array.isArray(submission.selectedTrackReadiness?.qualificationEvidence) && submission.selectedTrackReadiness.qualificationEvidence.length > 0,
    "selected track readiness should publish non-secret qualification evidence",
  );
  assert(submission.agentPlatform?.a2aProtocolVersion === "0.3", "submission profile should publish A2A version");
  assert(submission.agentPlatform?.googleCloudAgentBuilder?.supported === true, "submission profile should publish Agent Builder support");
  assert(
    submission.agentPlatform?.googleCloudAgentBuilder?.primaryImportUrl?.endsWith("/.well-known/agent.json"),
    "submission profile should publish Agent Builder A2A import URL",
  );
  assert(
    submission.agentPlatform?.googleCloudAgentBuilder?.openApiToolSchemaUrl?.endsWith("/openapi.json"),
    "submission profile should publish Agent Builder OpenAPI tool schema URL",
  );
  assert(
    submission.agentPlatform?.googleCloudAgentBuilder?.authHeader === "x-bazaarlens-a2a-key",
    "submission profile should publish Agent Builder auth header",
  );
  assert(submission.agentPlatform?.a2aHttpJsonUrl?.endsWith("/v1/message:send"), "submission profile should publish v1 send endpoint");
  assert(submission.agentPlatform?.a2aHttpJsonStreamUrl?.endsWith("/v1/message:stream"), "submission profile should publish v1 stream endpoint");
  assert(!JSON.stringify(submission).includes("mongodb://"), "submission profile must not expose MongoDB connection strings");
  assert(!JSON.stringify(submission).includes("secret"), "submission profile must not expose secret literals");

  assert(openapi.paths?.["/a2a"]?.post, "OpenAPI should document JSON-RPC /a2a");
  assert(openapi.paths?.["/v1/message:send"]?.post, "OpenAPI should document /v1/message:send");
  assert(openapi.paths?.["/v1/message:stream"]?.post, "OpenAPI should document /v1/message:stream");
  assert(openapi.paths?.["/v1/tasks/{id}"]?.get, "OpenAPI should document task lookup");

  return {
    protocolVersion: card.protocolVersion,
    modelProvider: card.metadata.modelProvider,
    selectedTrack: submission.selectedTrack,
    selectedTrackQualified: submission.selectedTrackReadiness.qualified,
    selectedTrackMcpServer: submission.selectedTrackReadiness.mcpServer.implementation,
    agentBuilderImport: true,
    paths: ["/a2a", "/v1/message:send", "/v1/message:stream", "/v1/tasks/{id}"],
  };
}

async function runAuthenticatedChecks() {
  const send = await requestJson("/v1/message:send", {
    method: "POST",
    headers: a2aHeaders({ "content-type": "application/a2a+json" }),
    body: JSON.stringify(messagePayload()),
  });
  assert(send.task?.kind === "task", "A2A send should return a task");
  assert(["completed", "input-required"].includes(send.task.status?.state), "A2A task should be terminal or input-required");
  assert(send.task.id, "A2A send should return a task id");

  const task = await requestJson(`/v1/tasks/${encodeURIComponent(send.task.id)}`, {
    headers: a2aHeaders(),
  });
  assert(task.kind === "task", "A2A task lookup should return a task");
  assert(task.id === send.task.id, "A2A task lookup should return the same task id");

  const rpcUnknown = await requestJson("/a2a", {
    method: "POST",
    headers: a2aHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "smoke-unknown",
      method: "tasks/unknown",
      params: {},
    }),
  });
  assert(rpcUnknown.error?.code === -32601, "JSON-RPC unknown method should return -32601");

  const streamText = await requestText("/v1/message:stream", {
    method: "POST",
    headers: a2aHeaders({ "content-type": "application/a2a+json" }),
    body: JSON.stringify(messagePayload()),
  });
  assert(streamText.includes('"task"'), "A2A REST stream should include a task event");
  assert(streamText.includes('"statusUpdate"'), "A2A REST stream should include a status update event");

  return {
    sendState: send.task.status.state,
    taskId: send.task.id,
    jsonRpcUnknownMethodGuard: true,
    stream: "ok",
  };
}

function messagePayload() {
  return {
    message: {
      kind: "message",
      role: "user",
      messageId: `smoke-${Date.now()}`,
      parts: [
        {
          kind: "data",
          mediaType: "application/json",
          data: {
            page: {
              url: "https://www.amazon.in/example/dp/B000000001",
              merchant: "amazon",
              title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
              price: { amount: 1299, currency: "INR", raw: "Rs 1,299" },
              mrp: null,
              discountText: null,
              rating: 4,
              reviewCount: 4200,
              seller: "Appario Retail Private Ltd",
              availability: "In stock",
              delivery: "Tomorrow",
              returnPolicy: "7 days replacement",
              selectedSize: null,
              images: [],
              breadcrumbs: ["Electronics", "Headphones"],
              visibleText: "boAt Airdopes 141 Bluetooth TWS Earbuds Rs 1,299",
              extractedAt: new Date().toISOString(),
            },
            intent: {
              query: "Should I buy this under Rs 1500?",
              budget: 1500,
              userContext: null,
            },
          },
        },
      ],
    },
  };
}

function hasInterface(card, suffix) {
  return [...(card.supportedInterfaces ?? []), ...(card.additionalInterfaces ?? [])].some((item) => typeof item.url === "string" && item.url.endsWith(suffix));
}

function a2aHeaders(headers = {}) {
  return {
    ...headers,
    "x-bazaarlens-a2a-key": a2aKey,
  };
}

async function readJson(path) {
  return requestJson(path);
}

async function requestJson(path, options = {}) {
  const text = await requestText(path, options);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} returned non-JSON: ${text.slice(0, 300)}`, { cause: error });
  }
}

async function requestText(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} ${response.status}: ${text || response.statusText}`);
  }
  return text;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
