import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult, ListToolsResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { AgentDecision, AnalyzeRequest } from "@bazaarlens/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectMcpClient } from "../mcp/mcp-client.js";
import { AgentMemoryService } from "./agent-memory.service.js";

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

describe("AgentMemoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetEnv();
  });

  it("uses the official MongoDB MCP find and create-index contracts for buying memory", async () => {
    const client = mcpClient({
      pages: [toolsPage(["find"], "page-2"), toolsPage(["insert-many", "create-collection", "create-index"])],
      callTool: ({ name }) =>
        name === "find"
          ? textResult(
              JSON.stringify([
                {
                  merchant: "amazon",
                  title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
                  url: "https://www.amazon.in/example/dp/OLD000001",
                  priceRaw: "Rs 1,299",
                  verdict: "buy",
                  summary: "Prior check had acceptable seller and price signals.",
                  checkedAt: "2026-06-09T09:00:00.000Z",
                },
              ]),
            )
          : textResult(JSON.stringify({ ok: true })),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    setTestEnv({
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb://localhost:27017/bazaarlens_agent",
    });

    const service = new AgentMemoryService();
    const result = await service.buyingContext("user-1", analyzeRequest());
    await service.onModuleDestroy();

    expect(result).toMatchObject({
      backend: "mongodb",
      provider: "MongoDB MCP Server",
      status: "available",
      tools: ["find", "insert-many", "create-collection", "create-index"],
    });
    expect(result.similarProducts).toHaveLength(1);
    expect(result.similarProducts[0]).toMatchObject({
      merchant: "amazon",
      verdict: "buy",
      summary: "Prior check had acceptable seller and price signals.",
    });
    expect(client.listTools).toHaveBeenNthCalledWith(2, { cursor: "page-2" }, { timeout: 15_000 });
    expect(client.callTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "find" }),
      undefined,
      expect.any(Object),
    );
    expect(client.callTool).toHaveBeenCalledWith(
      {
        name: "create-index",
        arguments: {
          database: "bazaarlens_agent",
          collection: "product_memory",
          name: "user_merchant_checkedAt",
          definition: [{ type: "classic", keys: { userId: 1, merchant: 1, checkedAt: -1 } }],
        },
      },
      undefined,
      expect.any(Object),
    );
    expect(client.callTool).toHaveBeenCalledWith(
      {
        name: "find",
        arguments: expect.objectContaining({
          database: "bazaarlens_agent",
          collection: "product_memory",
          filter: {
            userId: "user-1",
            merchant: "amazon",
            url: { $ne: "https://www.amazon.in/example/dp/B000000001" },
          },
          limit: 5,
        }),
      },
      undefined,
      expect.any(Object),
    );
  });

  it("writes completed buying decisions through MongoDB MCP insert-many", async () => {
    const client = mcpClient({
      pages: [toolsPage(["find", "insert-many", "create-collection", "create-index"])],
      callTool: () => textResult(JSON.stringify({ ok: true })),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    setTestEnv({
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb://localhost:27017/bazaarlens_agent",
    });

    const service = new AgentMemoryService();
    await service.recordAnalysis("user-1", "session-1", analyzeRequest(), agentDecision());
    await service.onModuleDestroy();

    expect(client.callTool).toHaveBeenCalledWith(
      {
        name: "insert-many",
        arguments: {
          database: "bazaarlens_agent",
          collection: "product_memory",
          documents: [
            expect.objectContaining({
              userId: "user-1",
              sessionId: "session-1",
              merchant: "amazon",
              title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
              url: "https://www.amazon.in/example/dp/B000000001",
              priceAmount: 1299,
              priceRaw: "Rs 1,299",
              verdict: "buy",
              confidence: 0.82,
              summary: "Seller, return window, and budget signals look acceptable.",
              actionType: "wishlist",
              model: "gemini-3.5-flash",
              visibleTextExcerpt: "boAt Airdopes 141 Bluetooth TWS Earbuds Rs 1,299",
            }),
          ],
        },
      },
      undefined,
      expect.any(Object),
    );
  });

  it("keeps buying memory available when MongoDB setup returns already-exists text errors", async () => {
    const client = mcpClient({
      pages: [toolsPage(["find", "insert-many", "create-collection", "create-index"])],
      callTool: ({ name }) => {
        if (name === "create-collection") return textResult("NamespaceExists: collection already exists");
        if (name === "create-index") return textResult("IndexOptionsConflict: equivalent index already exists");
        if (name === "find") return textResult("[]");
        return textResult(JSON.stringify({ ok: true }));
      },
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    setTestEnv({
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb://localhost:27017/bazaarlens_agent",
    });

    const service = new AgentMemoryService();
    const result = await service.buyingContext("user-1", analyzeRequest());
    await service.onModuleDestroy();

    expect(result.status).toBe("available");
    expect(result.notes).toContain("MongoDB MCP memory is connected; no prior comparable checks were found.");
  });

  it("marks MongoDB MCP text error responses as memory errors", async () => {
    const client = mcpClient({
      pages: [toolsPage(["find", "insert-many", "create-collection", "create-index"])],
      callTool: ({ name }) =>
        name === "find" ? textResult("MongoServerError: command failed while reading product memory") : textResult(JSON.stringify({ ok: true })),
    });
    vi.mocked(connectMcpClient).mockResolvedValue(client);
    setTestEnv({
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_BACKEND: "mongodb",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb://memory-user:redaction-sentinel@localhost:27017/bazaarlens_agent",
    });

    const service = new AgentMemoryService();
    const result = await service.buyingContext("user-1", analyzeRequest());
    await service.onModuleDestroy();

    expect(result.status).toBe("error");
    expect(result.notes[0]).toContain("MCP tool find failed");
    expect(result.notes.join(" ")).not.toContain("redaction-sentinel");
  });
});

function resetEnv(): void {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

function setTestEnv(overrides: NodeJS.ProcessEnv = {}): void {
  resetEnv();
  Object.assign(process.env, {
    ...originalEnv,
    NODE_ENV: "development",
    API_PUBLIC_URL: "http://localhost:8787",
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
    JWT_SECRET: "replace-with-a-strong-dev-secret",
    ...overrides,
  });
}

function mcpClient({
  pages,
  callTool,
}: {
  readonly pages: ListToolsResult[];
  readonly callTool: CallToolHandler;
}): Client {
  const client = new Client({ name: "bazaarlens-memory-test-client", version: "0.1.0" });
  let pageIndex = 0;
  vi.spyOn(client, "listTools").mockImplementation(async () => pages[Math.min(pageIndex++, pages.length - 1)] ?? toolsPage([]));
  vi.spyOn(client, "callTool").mockImplementation(async (params) => callTool(params));
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

function agentDecision(): AgentDecision {
  return {
    verdict: "buy",
    confidence: 0.82,
    summary: "Seller, return window, and budget signals look acceptable.",
    reasons: ["Price is within budget.", "Seller is visible."],
    risks: ["Check warranty terms before checkout."],
    checks: ["Confirm return window on the live page."],
    action: {
      type: "wishlist",
      label: "Save to wishlist",
      requiresApproval: true,
      payload: {},
    },
    model: "gemini-3.5-flash",
  };
}
