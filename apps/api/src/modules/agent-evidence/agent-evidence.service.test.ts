import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult, ListToolsResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { AnalyzeRequest } from "@bazaarlens/shared";
import { connectMcpClient } from "../mcp/mcp-client.js";
import { AgentEvidenceService } from "./agent-evidence.service.js";

vi.mock("../mcp/mcp-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../mcp/mcp-client.js")>();
  return {
    ...actual,
    connectMcpClient: vi.fn(),
    splitMcpArgs: vi.fn((value: string) => value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((arg) => arg.replace(/^"|"$/g, "")) ?? []),
  };
});

const originalEnv = { ...process.env };
type CallToolParams = Parameters<Client["callTool"]>[0];
type CallToolHandler = (params: CallToolParams) => CallToolResult;

describe("AgentEvidenceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("leaves MongoDB evidence to the product memory path", async () => {
    process.env = env({
      HACKATHON_TRACK: "mongodb",
      AGENT_MEMORY_ENABLED: "true",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb://user:secret@localhost:27017/bazaarlens",
    });

    await expect(new AgentEvidenceService().contextForAnalysis(analyzeRequest())).resolves.toBeUndefined();
    expect(connectMcpClient).not.toHaveBeenCalled();
  });

  it("uses only enabled non-Mongo evidence providers in all mode", async () => {
    const client = mcpClient({
      tools: ["list-projects"],
      callTool: () => textResult(JSON.stringify({ data: [{ id: "project-1" }] })),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    process.env = env({
      HACKATHON_TRACK: "elastic",
      AGENT_EVIDENCE_PROVIDERS: "all",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_TRACING_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-secret",
    });

    const service = new AgentEvidenceService();
    const contexts = await service.contextsForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(contexts.map((context) => context.provider)).toEqual(["arize"]);
    expect(connectMcpClient).toHaveBeenCalledOnce();
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("collects selected Arize MCP evidence without leaking credentials", async () => {
    const client = mcpClient({
      tools: ["list-projects", "list-traces", "list-sessions"],
      callTool: ({ name }) =>
        textResult(
          name === "list-projects"
            ? JSON.stringify({ data: [{ id: "project-1" }, { id: "project-2" }] })
            : JSON.stringify({ data: [{ id: "trace-1" }] }),
        ),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    process.env = env({
      HACKATHON_TRACK: "arize",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_TRACING_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-secret",
      PHOENIX_PROJECT: "bazaarlens",
    });

    const service = new AgentEvidenceService();
    const result = await service.contextForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(result).toMatchObject({
      provider: "arize",
      label: "Arize Phoenix",
      status: "available",
      tools: ["list-projects", "list-traces", "list-sessions"],
    });
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "list-projects" }),
      undefined,
      expect.any(Object),
    );
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "list-traces" }),
      undefined,
      expect.any(Object),
    );
    expect(JSON.stringify(result)).not.toContain("phoenix-secret");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("discovers MCP tools across paginated listTools responses", async () => {
    const client = mcpClient({
      pages: [toolsPage(["list-sessions"], "page-2"), toolsPage(["list-projects"])],
      callTool: () => textResult(JSON.stringify({ data: [{ id: "project-1" }] })),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    process.env = env({
      HACKATHON_TRACK: "arize",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_TRACING_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-secret",
    });

    const service = new AgentEvidenceService();
    const result = await service.contextForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(result?.tools).toEqual(["list-sessions", "list-projects"]);
    expect(client.listTools).toHaveBeenNthCalledWith(2, { cursor: "page-2" }, expect.any(Object));
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "list-projects" }),
      undefined,
      expect.any(Object),
    );
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("queries Elastic product evidence with the standard search tool", async () => {
    const client = mcpClient({
      tools: ["search", "list_indices", "get_mappings"],
      callTool: () =>
        textResult(
          "Total results: 2, showing 2.",
          JSON.stringify([
            { title: "boAt Airdopes 141", priceRaw: "Rs 1,299" },
            { title: "boAt Airdopes 141 Pro", priceRaw: "Rs 1,499" },
          ]),
        ),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    process.env = env({
      HACKATHON_TRACK: "elastic",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-secret",
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
      ELASTIC_PRODUCT_SOURCE_FIELDS: "title,priceRaw,url,seller",
    });

    const service = new AgentEvidenceService();
    const result = await service.contextForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(result).toMatchObject({
      provider: "elastic",
      label: "Elastic",
      status: "available",
      tools: ["search", "list_indices", "get_mappings"],
    });
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "search",
        arguments: expect.objectContaining({
          index: "bazaarlens-products",
          fields: ["title", "priceRaw", "url", "seller"],
          query_body: expect.objectContaining({
            size: 3,
            query: expect.objectContaining({ bool: expect.any(Object) }),
          }),
        }),
      }),
      undefined,
      expect.any(Object),
    );
    expect(JSON.stringify(result)).toContain("Elastic returned 2 indexed product/deal result");
    expect(JSON.stringify(result)).toContain("Elastic match 1: boAt Airdopes 141 - price Rs 1,299");
    expect(JSON.stringify(result)).not.toContain("elastic-secret");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("summarizes Elasticsearch hit sources as product evidence", async () => {
    const client = mcpClient({
      tools: ["search"],
      callTool: () =>
        textResult(
          JSON.stringify({
            hits: {
              hits: [
                {
                  _source: {
                    title: "Noise Buds VS104",
                    priceRaw: "Rs 999",
                    seller: "RetailNet",
                    rating: 4.1,
                    merchant: "flipkart",
                  },
                },
              ],
            },
          }),
        ),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    process.env = env({
      HACKATHON_TRACK: "elastic",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-secret",
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    });

    const service = new AgentEvidenceService();
    const result = await service.contextForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(result?.status).toBe("available");
    expect(JSON.stringify(result)).toContain("Elastic match 1: Noise Buds VS104 - price Rs 999 - seller RetailNet - rating 4.1 - source flipkart");
    expect(JSON.stringify(result)).toContain("Elastic returned 1 indexed product/deal result");
  });

  it("collects read-only Fivetran pipeline evidence with required schema files", async () => {
    const client = mcpClient({
      tools: ["get_account_info", "list_connections", "list_destinations", "list_groups", "sync_connection"],
      callTool: ({ name }) =>
        textResult(
          name === "get_account_info"
            ? JSON.stringify({ data: { account_name: "BazaarLens" } })
            : JSON.stringify({ data: { items: [{ id: `${name}-1` }, { id: `${name}-2` }], _total_items: 2 } }),
        ),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    process.env = env({
      HACKATHON_TRACK: "fivetran",
      FIVETRAN_MCP_ENABLED: "true",
      FIVETRAN_API_KEY: "fivetran-key",
      FIVETRAN_API_SECRET: "fivetran-secret",
    });

    const service = new AgentEvidenceService();
    const result = await service.contextForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(result).toMatchObject({
      provider: "fivetran",
      label: "Fivetran",
      status: "available",
      tools: ["get_account_info", "list_connections", "list_destinations", "list_groups", "sync_connection"],
    });
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "get_account_info",
        arguments: { schema_file: "open-api-definitions/account/get_account_info.json" },
      }),
      undefined,
      expect.any(Object),
    );
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "list_connections",
        arguments: { schema_file: "open-api-definitions/connections/list_connections.json" },
      }),
      undefined,
      expect.any(Object),
    );
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "list_destinations",
        arguments: { schema_file: "open-api-definitions/destinations/list_destinations.json" },
      }),
      undefined,
      expect.any(Object),
    );
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "list_groups",
        arguments: { schema_file: "open-api-definitions/groups/list_all_groups.json" },
      }),
      undefined,
      expect.any(Object),
    );
    expect(client.callTool).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "sync_connection" }),
      undefined,
      expect.any(Object),
    );
    expect(JSON.stringify(result)).toContain("Fivetran inventory returned 2 connection");
    expect(JSON.stringify(result)).toContain("2 destination");
    expect(JSON.stringify(result)).toContain("2 group");
    expect(JSON.stringify(result)).not.toContain("fivetran-secret");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("marks Fivetran text error responses as MCP evidence errors", async () => {
    const client = mcpClient({
      tools: ["get_account_info"],
      callTool: () => textResult("Error: Invalid schema_file. Expected open-api-definitions/account/get_account_info.json"),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    process.env = env({
      HACKATHON_TRACK: "fivetran",
      FIVETRAN_MCP_ENABLED: "true",
      FIVETRAN_API_KEY: "fivetran-key",
      FIVETRAN_API_SECRET: "fivetran-secret",
    });

    const service = new AgentEvidenceService();
    const result = await service.contextForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(result).toMatchObject({
      provider: "fivetran",
      status: "error",
    });
    expect(JSON.stringify(result)).toContain("Invalid schema_file");
    expect(JSON.stringify(result)).not.toContain("fivetran-secret");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("collects GitLab project evidence with authenticated read-only tools", async () => {
    const client = mcpClient({
      tools: ["get_mcp_server_version", "search", "manage_pipeline", "create_issue"],
      callTool: ({ name }) =>
        textResult(
          name === "get_mcp_server_version"
            ? JSON.stringify({ version: "18.7.0" })
            : JSON.stringify({ data: [{ id: `${name}-1` }, { id: `${name}-2` }] }),
        ),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    process.env = env({
      HACKATHON_TRACK: "gitlab",
      GITLAB_MCP_ENABLED: "true",
      GITLAB_MCP_HTTP_URL: "https://gitlab.com/api/v4/mcp",
      GITLAB_MCP_AUTH_READY: "true",
      GITLAB_PROJECT_ID: "aryan877/bazaarlens",
    });

    const service = new AgentEvidenceService();
    const result = await service.contextForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(result).toMatchObject({
      provider: "gitlab",
      label: "GitLab",
      status: "available",
      tools: ["get_mcp_server_version", "search", "manage_pipeline", "create_issue"],
    });
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "search",
        arguments: expect.objectContaining({
          project_id: "aryan877/bazaarlens",
          scope: "issues",
          state: "opened",
          per_page: 3,
        }),
      }),
      undefined,
      expect.any(Object),
    );
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "manage_pipeline",
        arguments: {
          id: "aryan877/bazaarlens",
          list: true,
          per_page: 3,
          page: 1,
        },
      }),
      undefined,
      expect.any(Object),
    );
    expect(client.callTool).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "create_issue" }),
      undefined,
      expect.any(Object),
    );
    expect(JSON.stringify(result)).toContain("GitLab returned 2 open issue");
    expect(JSON.stringify(result)).toContain("GitLab returned 2 recent pipeline");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("surfaces Dynatrace runtime evidence without leaking bearer tokens", async () => {
    const client = mcpClient({
      tools: ["execute-dql", "explain-dql", "query-problems"],
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    process.env = env({
      HACKATHON_TRACK: "dynatrace",
      DYNATRACE_MCP_ENABLED: "true",
      DYNATRACE_ENVIRONMENT_URL: "https://abc123.apps.dynatrace.com",
      DYNATRACE_API_TOKEN: "dynatrace-secret",
    });

    const service = new AgentEvidenceService();
    const result = await service.contextForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(result).toMatchObject({
      provider: "dynatrace",
      label: "Dynatrace",
      status: "available",
      tools: ["execute-dql", "explain-dql", "query-problems"],
    });
    expect(client.callTool).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain("Dynatrace MCP is reachable");
    expect(JSON.stringify(result)).not.toContain("dynatrace-secret");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("collects explicit multi-provider evidence with the selected track first", async () => {
    const arizeClient = mcpClient({
      tools: ["list-projects"],
      callTool: () => textResult(JSON.stringify({ data: [{ id: "project-1" }] })),
    });
    const elasticClient = mcpClient({
      tools: ["search"],
      callTool: () => textResult(JSON.stringify([{ title: "boAt Airdopes 141", priceRaw: "Rs 1,299" }])),
    });
    vi.mocked(connectMcpClient).mockImplementation(async (config) =>
      config.name.includes("elastic") ? elasticClient : arizeClient,
    );
    process.env = env({
      HACKATHON_TRACK: "arize",
      AGENT_EVIDENCE_PROVIDERS: "arize,elastic",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_TRACING_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-secret",
      PHOENIX_PROJECT: "bazaarlens",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-secret",
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    });

    const service = new AgentEvidenceService();
    const contexts = await service.contextsForAnalysis(analyzeRequest());
    await service.onModuleDestroy();

    expect(contexts.map((context) => context.provider)).toEqual(["arize", "elastic"]);
    expect(contexts.map((context) => context.status)).toEqual(["available", "available"]);
    expect(arizeClient.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "list-projects" }),
      undefined,
      expect.any(Object),
    );
    expect(elasticClient.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "search",
        arguments: expect.objectContaining({ index: "bazaarlens-products" }),
      }),
      undefined,
      expect.any(Object),
    );
    expect(JSON.stringify(contexts)).not.toContain("phoenix-secret");
    expect(JSON.stringify(contexts)).not.toContain("elastic-secret");
    expect(arizeClient.close).toHaveBeenCalledOnce();
    expect(elasticClient.close).toHaveBeenCalledOnce();
  });

});

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...originalEnv,
    NODE_ENV: "development",
    API_PUBLIC_URL: "http://localhost:8787",
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
    JWT_SECRET: "replace-with-a-strong-dev-secret",
    ...overrides,
  };
}

function mcpClient({
  tools = [],
  pages,
  callTool,
}: {
  readonly tools?: string[];
  readonly pages?: ListToolsResult[];
  readonly callTool?: CallToolHandler;
}): Client {
  const client = new Client({ name: "bazaarlens-test-client", version: "0.1.0" });
  const toolPages = pages ?? [toolsPage(tools)];
  let pageIndex = 0;
  vi.spyOn(client, "listTools").mockImplementation(async () => toolPages[Math.min(pageIndex++, toolPages.length - 1)] ?? toolsPage([]));
  vi.spyOn(client, "callTool").mockImplementation(async (params) => callTool?.(params) ?? textResult(""));
  vi.spyOn(client, "close").mockResolvedValue(undefined);
  return client;
}

function toolsPage(names: string[], nextCursor?: string): ListToolsResult {
  return {
    tools: names.map(tool),
    ...(nextCursor ? { nextCursor } : {}),
  };
}

function tool(name: string): Tool {
  return {
    name,
    inputSchema: { type: "object" },
  };
}

function textResult(...texts: string[]): CallToolResult {
  return {
    content: texts.map((text) => ({ type: "text", text })),
  };
}

function analyzeRequest(): AnalyzeRequest {
  return {
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
      extractedAt: "2026-06-09T10:00:00.000Z",
    },
    intent: {
      query: "Should I buy this under Rs 1500?",
      budget: 1500,
      userContext: null,
    },
  };
}
