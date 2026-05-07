import { afterEach, describe, expect, it } from "vitest";
import { getEnv } from "./env.js";

const originalEnv = { ...process.env };

describe("getEnv", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("allows local development defaults for Docker Compose", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      API_PUBLIC_URL: "http://localhost:8787",
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
      JWT_SECRET: "replace-with-a-strong-dev-secret",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
    };

    expect(getEnv()).toMatchObject({
      NODE_ENV: "development",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_VERTEX_MODEL: "gemini-3.5-flash",
      JWT_EXPIRES_IN: "14d",
      RATE_LIMIT_DEFAULT_LIMIT: 300,
      RATE_LIMIT_AGENT_ANALYZE_LIMIT: 20,
    });
  });

  it("rejects production deployments with dev secrets or missing required Google Cloud config", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "http://localhost:8787",
      CORS_ORIGIN: "",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "replace-with-a-strong-dev-secret",
      GOOGLE_CLIENT_ID: "",
      A2A_AGENT_KEY: "",
      AGENT_MEMORY_ENABLED: "false",
    };

    expect(() => getEnv()).toThrow(/GOOGLE_VERTEX_API_KEY/);
    expect(() => getEnv()).toThrow(/A2A_AGENT_KEY/);
    expect(() => getEnv()).toThrow(/mongodb track/);
    expect(() => getEnv()).toThrow(/CORS_ORIGIN/);
    expect(() => getEnv()).toThrow(/API_PUBLIC_URL/);
    expect(() => getEnv()).toThrow(/JWT_SECRET/);
  });

  it("accepts GOOGLE_CLOUD_PROJECT as the production ADC project source", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_API_KEY: "",
      GOOGLE_VERTEX_PROJECT: "",
      GOOGLE_CLOUD_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      GOOGLE_CLIENT_ID: "",
    };

    expect(getEnv()).toMatchObject({
      GOOGLE_VERTEX_PROJECT: "",
      GOOGLE_CLOUD_PROJECT: "bazaarlens-gcp-project",
    });
  });

  it("accepts a Google ADC credential file path for project-based Vertex deployments", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_API_KEY: "",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      GOOGLE_APPLICATION_CREDENTIALS: "/run/secrets/bazaarlens/google-application-credentials.json",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      GOOGLE_CLIENT_ID: "",
    };

    expect(getEnv()).toMatchObject({
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      GOOGLE_APPLICATION_CREDENTIALS: "/run/secrets/bazaarlens/google-application-credentials.json",
    });
  });

  it("rejects malformed JWT lifetimes", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      JWT_EXPIRES_IN: "forever",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      GOOGLE_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    };

    expect(() => getEnv()).toThrow(/JWT_EXPIRES_IN/);
  });

  it("rejects malformed Google OAuth client IDs when configured", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      GOOGLE_CLIENT_ID: "https://bad-client-id.apps.googleusercontent.com",
    };

    expect(() => getEnv()).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("accepts production with Google Cloud Gemini, A2A registration, and MongoDB MCP memory", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app,https://www.bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      JWT_EXPIRES_IN: "12h",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      GOOGLE_CLIENT_ID: "",
    };

    expect(getEnv()).toMatchObject({
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      GOOGLE_VERTEX_MODEL: "gemini-3.5-flash",
      HACKATHON_TRACK: "mongodb",
      A2A_AGENT_USER_EMAIL: "a2a-agent@bazaarlens.app",
      AGENT_MEMORY_ENABLED: true,
      AGENT_MEMORY_BACKEND: "mongodb",
      GOOGLE_CLIENT_ID: "",
      JWT_EXPIRES_IN: "12h",
      TRUST_PROXY_HOPS: 0,
    });
  });

  it("rejects malformed evidence provider selectors", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      API_PUBLIC_URL: "http://localhost:8787",
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
      JWT_SECRET: "replace-with-a-strong-dev-secret",
      AGENT_EVIDENCE_PROVIDERS: "mongodb,elastic",
    };

    expect(() => getEnv()).toThrow(/AGENT_EVIDENCE_PROVIDERS/);

    process.env.AGENT_EVIDENCE_PROVIDERS = "all,elastic";
    expect(() => getEnv()).toThrow(/AGENT_EVIDENCE_PROVIDERS/);
  });

  it("rejects production when an explicit evidence provider is missing runtime config", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "mongodb",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      AGENT_EVIDENCE_PROVIDERS: "arize,elastic",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_TRACING_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-key",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-key",
    };

    expect(() => getEnv()).toThrow(/elastic evidence provider/);
  });

  it("accepts production with explicit multi-provider evidence when every provider is runtime-ready", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "mongodb",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      AGENT_EVIDENCE_PROVIDERS: "arize,elastic",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_TRACING_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-key",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-key",
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    };

    expect(getEnv()).toMatchObject({
      NODE_ENV: "production",
      HACKATHON_TRACK: "mongodb",
      AGENT_EVIDENCE_PROVIDERS: "arize,elastic",
      ARIZE_MCP_ENABLED: true,
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    });
  });

  it("rejects production when all evidence providers are requested but none are enabled", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "mongodb",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      AGENT_EVIDENCE_PROVIDERS: "all",
    };

    expect(() => getEnv()).toThrow(/AGENT_EVIDENCE_PROVIDERS=all requires/);
  });

  it("rejects production when all evidence includes an enabled provider without runtime config", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "mongodb",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      AGENT_EVIDENCE_PROVIDERS: "all",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-key",
    };

    expect(() => getEnv()).toThrow(/enabled elastic/);
  });

  it("accepts production when all enabled evidence providers are runtime-ready", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "mongodb",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      AGENT_EVIDENCE_PROVIDERS: "all",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_TRACING_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-key",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-key",
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    };

    expect(getEnv()).toMatchObject({
      NODE_ENV: "production",
      HACKATHON_TRACK: "mongodb",
      AGENT_EVIDENCE_PROVIDERS: "all",
      ARIZE_MCP_ENABLED: true,
      ELASTIC_MCP_ENABLED: true,
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    });
  });

  it("rejects production Phoenix tracing without a collector endpoint or host", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb+srv://example.mongodb.net/bazaarlens_agent",
      PHOENIX_TRACING_ENABLED: "true",
    };

    expect(() => getEnv()).toThrow(/PHOENIX_COLLECTOR_ENDPOINT/);
  });

  it("accepts production with Arize as the selected evidence track", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "arize",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_TRACING_ENABLED: "true",
      PHOENIX_COLLECTOR_ENDPOINT: "https://phoenix.example/v1/traces",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-key",
    };

    expect(getEnv()).toMatchObject({
      NODE_ENV: "production",
      HACKATHON_TRACK: "arize",
      ARIZE_MCP_ENABLED: true,
      PHOENIX_TRACING_ENABLED: true,
    });
  });

  it("requires product evidence config when Elastic is the selected track", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "elastic",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-key",
    };

    expect(() => getEnv()).toThrow(/elastic track/);
  });

  it("accepts production with Elastic product search as the selected evidence track", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "elastic",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-key",
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    };

    expect(getEnv()).toMatchObject({
      NODE_ENV: "production",
      HACKATHON_TRACK: "elastic",
      ELASTIC_MCP_ENABLED: true,
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    });
  });

  it("accepts production with Fivetran as a read-only pipeline evidence track", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "fivetran",
      FIVETRAN_MCP_ENABLED: "true",
      FIVETRAN_API_KEY: "fivetran-key",
      FIVETRAN_API_SECRET: "fivetran-secret",
      FIVETRAN_ALLOW_WRITES: "false",
    };

    expect(getEnv()).toMatchObject({
      NODE_ENV: "production",
      HACKATHON_TRACK: "fivetran",
      FIVETRAN_MCP_ENABLED: true,
      FIVETRAN_ALLOW_WRITES: false,
    });
  });

  it("rejects GitLab track without an OAuth-ready MCP session", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "gitlab",
      GITLAB_MCP_ENABLED: "true",
      GITLAB_MCP_HTTP_URL: "https://gitlab.com/api/v4/mcp",
      GITLAB_PROJECT_ID: "aryan877/bazaarlens",
    };

    expect(() => getEnv()).toThrow(/gitlab track/);
  });

  it("accepts production with GitLab as a configured project evidence track", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "gitlab",
      GITLAB_MCP_ENABLED: "true",
      GITLAB_MCP_HTTP_URL: "https://gitlab.com/api/v4/mcp",
      GITLAB_MCP_AUTH_READY: "true",
      GITLAB_PROJECT_ID: "aryan877/bazaarlens",
    };

    expect(getEnv()).toMatchObject({
      NODE_ENV: "production",
      HACKATHON_TRACK: "gitlab",
      GITLAB_MCP_ENABLED: true,
      GITLAB_PROJECT_ID: "aryan877/bazaarlens",
    });
  });

  it("accepts production with Dynatrace as the selected observability evidence track", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://prod-user:prod-password@postgres:5432/bazaarlens?schema=public",
      JWT_SECRET: "a-production-jwt-secret-with-more-than-32-chars",
      GOOGLE_VERTEX_PROJECT: "bazaarlens-gcp-project",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
      HACKATHON_TRACK: "dynatrace",
      DYNATRACE_MCP_ENABLED: "true",
      DYNATRACE_ENVIRONMENT_URL: "https://abc123.apps.dynatrace.com",
      DYNATRACE_API_TOKEN: "dynatrace-token",
    };

    expect(getEnv()).toMatchObject({
      NODE_ENV: "production",
      HACKATHON_TRACK: "dynatrace",
      DYNATRACE_MCP_ENABLED: true,
    });
  });

});
