import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

let server;

describe("smoke-a2a script", () => {
  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = undefined;
    }
  });

  it("passes public A2A registration checks against a deployed API shape", async () => {
    const apiUrl = await startServer(publicA2aHandler);

    const result = await runSmokeA2a({ API_URL: apiUrl });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      apiUrl,
      publicChecks: {
        protocolVersion: "0.3",
        modelProvider: "google-vertex",
        selectedTrack: "mongodb",
      },
      authenticated: false,
    });
  });

  it("fails when authenticated checks are required but no A2A key is provided", async () => {
    const apiUrl = await startServer(publicA2aHandler);

    const result = await runSmokeA2a({ API_URL: apiUrl, REQUIRE_A2A_AUTH: "1" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("REQUIRE_A2A_AUTH=1 expects A2A_AGENT_KEY to be set");
  });

  it("runs authenticated send, lookup, RPC error, and stream checks when a key is provided", async () => {
    const apiUrl = await startServer(authenticatedA2aHandler);

    const result = await runSmokeA2a({ API_URL: apiUrl, A2A_AGENT_KEY: "test-a2a-key" });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      authenticated: true,
      authChecks: {
        sendState: "completed",
        taskId: "task-1",
        jsonRpcUnknownMethodGuard: true,
        stream: "ok",
      },
    });
  });
});

async function startServer(handler) {
  server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  return `http://127.0.0.1:${address.port}`;
}

async function runSmokeA2a(env) {
  const child = spawn(process.execPath, ["scripts/smoke-a2a.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const [stdout, stderr, status] = await Promise.all([
    streamText(child.stdout),
    streamText(child.stderr),
    exitStatus(child),
  ]);
  return { stdout, stderr, status };
}

function publicA2aHandler(request, response) {
  if (!request.url) return sendJson(response, 404, {});
  if (request.url === "/.well-known/agent.json") return sendJson(response, 200, agentCard());
  if (request.url === "/.well-known/bazaarlens-submission.json") return sendJson(response, 200, submissionProfile());
  if (request.url === "/openapi.json") return sendJson(response, 200, openapi());
  return sendJson(response, 404, { error: "not_found" });
}

function authenticatedA2aHandler(request, response) {
  if (!request.url) return sendJson(response, 404, {});
  if (request.url === "/v1/message:send" && request.method === "POST") return sendJson(response, 200, { task: task() });
  if (request.url === "/v1/tasks/task-1" && request.method === "GET") return sendJson(response, 200, task());
  if (request.url === "/a2a" && request.method === "POST") {
    return sendJson(response, 200, {
      jsonrpc: "2.0",
      id: "smoke-unknown",
      error: {
        code: -32601,
        message: "Method not found",
      },
    });
  }
  if (request.url === "/v1/message:stream" && request.method === "POST") {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(`data: ${JSON.stringify({ task: task() })}\n\ndata: ${JSON.stringify({ statusUpdate: { kind: "status-update" } })}\n\n`);
    return;
  }
  return publicA2aHandler(request, response);
}

function agentCard() {
  return {
    name: "BazaarLens",
    protocolVersion: "0.3",
    preferredTransport: "JSONRPC",
    capabilities: { streaming: true },
    securitySchemes: {
      bazaarlensA2aKey: {
        name: "x-bazaarlens-a2a-key",
      },
    },
    supportedInterfaces: [
      { url: "http://127.0.0.1/a2a" },
      { url: "http://127.0.0.1/v1/message:send" },
    ],
    additionalInterfaces: [],
    metadata: {
      modelProvider: "google-vertex",
    },
  };
}

function submissionProfile() {
  return {
    name: "BazaarLens",
    selectedTrack: "mongodb",
    selectedTrackReadiness: {
      provider: "mongodb",
      label: "MongoDB",
      enabled: true,
      configured: true,
      transport: "http",
      qualified: true,
      runtimePath: "agent-memory",
      mcpServer: {
        implementation: "Official MongoDB MCP Server",
        sourceUrl: "https://github.com/mongodb-js/mongodb-mcp-server",
        launch: "docker run --rm -i -e MDB_MCP_CONNECTION_STRING -e MDB_MCP_TRANSPORT=http -e MDB_MCP_HTTP_HOST=0.0.0.0 mongodb/mongodb-mcp-server:1.11.0",
      },
      qualificationEvidence: ["Reads prior user product decisions during analysis."],
    },
    qualification: {
      poweredByGemini: true,
      googleAgentPlatformSurface: true,
    },
    agentPlatform: {
      a2aProtocolVersion: "0.3",
      googleCloudAgentBuilder: {
        supported: true,
        importMode: "custom_a2a_agent",
        primaryImportUrl: "http://127.0.0.1/.well-known/agent.json",
        openApiToolSchemaUrl: "http://127.0.0.1/openapi.json",
        authHeader: "x-bazaarlens-a2a-key",
      },
      a2aHttpJsonUrl: "http://127.0.0.1/v1/message:send",
      a2aHttpJsonStreamUrl: "http://127.0.0.1/v1/message:stream",
    },
  };
}

function openapi() {
  return {
    paths: {
      "/a2a": { post: {} },
      "/v1/message:send": { post: {} },
      "/v1/message:stream": { post: {} },
      "/v1/tasks/{id}": { get: {} },
    },
  };
}

function task() {
  return {
    id: "task-1",
    kind: "task",
    status: { state: "completed" },
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function streamText(stream) {
  let text = "";
  for await (const chunk of stream) {
    text += chunk;
  }
  return text;
}

async function exitStatus(child) {
  return new Promise((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });
}
