import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Env } from "./env.js";
import { buildThrottlerOptions } from "./rate-limit.js";

const baseEnv = {
  NODE_ENV: "development",
  API_PORT: 8787,
  API_PUBLIC_URL: "http://localhost:8787",
  CORS_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
  JWT_SECRET: "replace-with-a-strong-dev-secret",
  JWT_EXPIRES_IN: "14d",
  GOOGLE_CLIENT_ID: "",
  A2A_AGENT_KEY: "",
  A2A_AGENT_USER_EMAIL: "a2a-agent@bazaarlens.app",
  GOOGLE_VERTEX_API_KEY: "",
  GOOGLE_APPLICATION_CREDENTIALS: "",
  GOOGLE_VERTEX_PROJECT: "",
  GOOGLE_CLOUD_PROJECT: "",
  GOOGLE_VERTEX_LOCATION: "global",
  GOOGLE_VERTEX_MODEL: "gemini-3.5-flash",
  HACKATHON_TRACK: "mongodb",
  AGENT_EVIDENCE_PROVIDERS: "",
  AGENT_MEMORY_ENABLED: false,
  AGENT_MEMORY_BACKEND: "mongodb",
  AGENT_MEMORY_MCP_HTTP_URL: "",
  AGENT_MEMORY_MCP_COMMAND: "",
  AGENT_MEMORY_MCP_ARGS: "",
  MONGODB_MEMORY_CONNECTION_STRING: "",
  MONGODB_MEMORY_DATABASE: "bazaarlens_agent",
  MONGODB_MEMORY_COLLECTION: "product_memory",
  MCP_READINESS_CHECKS_ENABLED: false,
  MCP_READINESS_TIMEOUT_MS: 5000,
  ELASTIC_MCP_ENABLED: false,
  ELASTIC_MCP_HTTP_URL: "",
  ELASTIC_MCP_COMMAND: "",
  ELASTIC_MCP_ARGS: "",
  ELASTIC_KIBANA_URL: "",
  ELASTIC_KIBANA_SPACE: "",
  ELASTIC_API_KEY: "",
  ELASTIC_PRODUCT_INDEX: "",
  ELASTIC_PRODUCT_SEARCH_TOOL: "",
  ELASTIC_PRODUCT_SOURCE_FIELDS: "title,merchant,priceRaw,url,seller,rating,reviewCount,availability,checkedAt",
  ES_URL: "",
  ES_API_KEY: "",
  ES_USERNAME: "",
  ES_PASSWORD: "",
  ES_SSL_SKIP_VERIFY: false,
  ARIZE_MCP_ENABLED: false,
  ARIZE_MCP_COMMAND: "npx",
  ARIZE_MCP_ARGS: "",
  FIVETRAN_MCP_ENABLED: false,
  FIVETRAN_MCP_COMMAND: "uvx",
  FIVETRAN_MCP_ARGS: "",
  FIVETRAN_API_KEY: "",
  FIVETRAN_API_SECRET: "",
  FIVETRAN_ALLOW_WRITES: false,
  GITLAB_MCP_ENABLED: false,
  GITLAB_MCP_HTTP_URL: "",
  GITLAB_MCP_COMMAND: "",
  GITLAB_MCP_ARGS: "",
  GITLAB_MCP_AUTH_READY: false,
  GITLAB_PROJECT_ID: "",
  DYNATRACE_MCP_ENABLED: false,
  DYNATRACE_MCP_HTTP_URL: "",
  DYNATRACE_ENVIRONMENT_URL: "",
  DYNATRACE_API_TOKEN: "",
  PHOENIX_TRACING_ENABLED: false,
  PHOENIX_COLLECTOR_ENDPOINT: "",
  PHOENIX_HOST: "",
  PHOENIX_API_KEY: "",
  PHOENIX_PROJECT: "",
  TRUST_PROXY_HOPS: 0,
  RATE_LIMIT_DEFAULT_TTL_SECONDS: 60,
  RATE_LIMIT_DEFAULT_LIMIT: 300,
  RATE_LIMIT_AUTH_TTL_SECONDS: 60,
  RATE_LIMIT_AUTH_LIMIT: 30,
  RATE_LIMIT_AGENT_ANALYZE_TTL_SECONDS: 60,
  RATE_LIMIT_AGENT_ANALYZE_LIMIT: 20,
  RATE_LIMIT_AGENT_APPROVAL_TTL_SECONDS: 60,
  RATE_LIMIT_AGENT_APPROVAL_LIMIT: 60,
} satisfies Env;

describe("buildThrottlerOptions", () => {
  it("builds the global and scoped API throttlers from env", () => {
    const options = buildThrottlerOptions(baseEnv);

    expect(Array.isArray(options)).toBe(false);
    if (Array.isArray(options)) throw new Error("expected object throttler options");
    expect(options.throttlers.map((throttler) => throttler.name)).toEqual([
      "default",
      "auth",
      "agentAnalyze",
      "agentApproval",
    ]);
    expect(options.throttlers[0]).toMatchObject({
      name: "default",
      ttl: 60000,
      limit: 300,
    });
  });

  it("scopes auth throttling to register, login, and Google auth only", () => {
    const authThrottler = getThrottler("auth");

    expect(authThrottler.skipIf?.(contextFor("AuthController", "login"))).toBe(false);
    expect(authThrottler.skipIf?.(contextFor("AuthController", "google"))).toBe(false);
    expect(authThrottler.skipIf?.(contextFor("AgentController", "analyze"))).toBe(true);
  });

  it("scopes expensive agent throttles to their exact endpoints", () => {
    const analyzeThrottler = getThrottler("agentAnalyze");
    const approvalThrottler = getThrottler("agentApproval");

    expect(analyzeThrottler.skipIf?.(contextFor("AgentController", "analyze"))).toBe(false);
    expect(analyzeThrottler.skipIf?.(contextFor("AgentController", "approval"))).toBe(true);
    expect(approvalThrottler.skipIf?.(contextFor("AgentController", "approval"))).toBe(false);
    expect(approvalThrottler.skipIf?.(contextFor("AuthController", "login"))).toBe(true);
  });
});

function getThrottler(name: string) {
  const options = buildThrottlerOptions(baseEnv);
  if (Array.isArray(options)) throw new Error("expected object throttler options");
  const throttler = options.throttlers.find((candidate) => candidate.name === name);
  if (!throttler) throw new Error(`missing throttler ${name}`);
  return throttler;
}

function contextFor(className: string, handlerName: string): ExecutionContext {
  return {
    getClass: () => ({ name: className }),
    getHandler: () => ({ name: handlerName }),
  } as unknown as ExecutionContext;
}
