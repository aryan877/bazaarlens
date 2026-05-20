import { afterEach, describe, expect, it } from "vitest";
import { McpCapabilitiesService } from "./mcp-capabilities.service.js";

const originalEnv = { ...process.env };

describe("McpCapabilitiesService", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("summarizes real MCP connectors without leaking credentials", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      API_PUBLIC_URL: "http://localhost:8787",
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
      JWT_SECRET: "replace-with-a-strong-dev-secret",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_MCP_HTTP_URL: "http://mongo-mcp:9090/mcp",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-secret",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-secret",
      FIVETRAN_MCP_ENABLED: "true",
      FIVETRAN_API_KEY: "fivetran-key",
      FIVETRAN_API_SECRET: "fivetran-secret",
      GITLAB_MCP_ENABLED: "true",
      GITLAB_MCP_HTTP_URL: "https://gitlab.com/api/v4/mcp",
      GITLAB_MCP_AUTH_READY: "true",
      GITLAB_PROJECT_ID: "aryan877/bazaarlens",
      DYNATRACE_MCP_ENABLED: "true",
      DYNATRACE_ENVIRONMENT_URL: "https://abc123.apps.dynatrace.com",
      DYNATRACE_API_TOKEN: "dynatrace-secret",
    };

    const result = await new McpCapabilitiesService().readiness({ verify: false });

    expect(result.checksEnabled).toBe(false);
    expect(result.selectedTrack).toBe("mongodb");
    expect(result.selectedConnector).toMatchObject({
      provider: "mongodb",
      label: "MongoDB",
      status: "configured",
      runtimePath: "agent-memory",
      mcpServer: {
        implementation: "Official MongoDB MCP Server",
        sourceUrl: "https://github.com/mongodb-js/mongodb-mcp-server",
        launch: "docker run --rm -i -e MDB_MCP_CONNECTION_STRING -e MDB_MCP_TRANSPORT=http -e MDB_MCP_HTTP_HOST=0.0.0.0 mongodb/mongodb-mcp-server:1.11.0",
      },
      qualificationEvidence: expect.arrayContaining([expect.stringContaining("Reads prior user product decisions")]),
    });
    expect(result.selectedTrackQualified).toBe(true);
    expect(result.connectors).toHaveLength(6);
    expect(result.connectors.map((connector) => [connector.provider, connector.status])).toEqual([
      ["mongodb", "configured"],
      ["elastic", "configured"],
      ["arize", "configured"],
      ["fivetran", "configured"],
      ["gitlab", "configured"],
      ["dynatrace", "configured"],
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result.connectors.find((connector) => connector.provider === "elastic")?.transport).toBe("http");
    expect(result.connectors.find((connector) => connector.provider === "elastic")).toMatchObject({
      runtimePath: "agent-evidence",
      mcpServer: expect.objectContaining({
        implementation: "Elastic Agent Builder MCP or Elasticsearch MCP Server",
      }),
      qualificationEvidence: expect.arrayContaining([expect.stringContaining("Queries product")]),
    });
    expect(result.connectors.find((connector) => connector.provider === "dynatrace")?.transport).toBe("http");
  });

  it("marks the selected track unqualified when its connector is missing runtime config", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      API_PUBLIC_URL: "http://localhost:8787",
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
      JWT_SECRET: "replace-with-a-strong-dev-secret",
      HACKATHON_TRACK: "elastic",
      ELASTIC_MCP_ENABLED: "true",
    };

    const result = await new McpCapabilitiesService().readiness({ verify: false });

    expect(result.selectedTrack).toBe("elastic");
    expect(result.selectedConnector).toMatchObject({
      provider: "elastic",
      status: "missing_config",
    });
    expect(result.selectedTrackQualified).toBe(false);
  });
});
