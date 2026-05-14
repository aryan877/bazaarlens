import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  AgentMemoryContextSchema,
  AgentMemoryProductMemorySchema,
  type AgentDecision,
  type AnalyzeRequest,
  type AgentMemoryContext,
  type AgentMemoryProductMemory,
} from "@bazaarlens/shared";
import { getEnv, type Env } from "../../shared/env.js";
import { connectMcpClient, listMcpToolNamesFromClient, splitMcpArgs } from "../mcp/mcp-client.js";
import { DEFAULT_MONGODB_MCP_ARGS } from "../mcp/mongodb-mcp.js";

type McpToolResult = Awaited<ReturnType<Client["callTool"]>>;
type McpContentResult = McpToolResult & Pick<CallToolResult, "content">;

const CLIENT_INFO = { name: "bazaarlens-api", version: "0.1.0" };
@Injectable()
export class AgentMemoryService implements OnModuleDestroy {
  private readonly env = getEnv();
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private toolNames: string[] = [];
  private prepared = false;

  async onModuleDestroy(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = null;
    this.connecting = null;
  }

  async buyingContext(userId: string, input: AnalyzeRequest): Promise<AgentMemoryContext> {
    if (!this.env.AGENT_MEMORY_ENABLED) return disabledContext(this.env);

    try {
      await this.prepareMongoMemory();
      const result = await this.callTool("find", {
        database: this.env.MONGODB_MEMORY_DATABASE,
        collection: this.env.MONGODB_MEMORY_COLLECTION,
        filter: {
          userId,
          merchant: input.page.merchant,
          url: { $ne: input.page.url },
        },
        projection: {
          _id: 0,
          merchant: 1,
          title: 1,
          url: 1,
          priceRaw: 1,
          verdict: 1,
          summary: 1,
          checkedAt: 1,
        },
        sort: { checkedAt: -1 },
        limit: 5,
      });

      const similarProducts = parseProductMemory(result);
      return AgentMemoryContextSchema.parse({
        ...baseContext(this.env, "available"),
        tools: this.toolNames,
        similarProducts,
        notes: similarProducts.length
          ? [`MongoDB MCP found ${similarProducts.length} recent ${input.page.merchant} check(s) for this user.`]
          : ["MongoDB MCP memory is connected; no prior comparable checks were found."],
      });
    } catch (error) {
      return baseContext(this.env, "error", [compactError(error)]);
    }
  }

  async recordAnalysis(userId: string, sessionId: string, input: AnalyzeRequest, decision: AgentDecision): Promise<void> {
    if (!this.env.AGENT_MEMORY_ENABLED) return;

    try {
      await this.prepareMongoMemory();
      await this.callTool("insert-many", {
        database: this.env.MONGODB_MEMORY_DATABASE,
        collection: this.env.MONGODB_MEMORY_COLLECTION,
        documents: [
          {
            userId,
            sessionId,
            merchant: input.page.merchant,
            title: input.page.title,
            url: input.page.url,
            priceAmount: input.page.price?.amount ?? null,
            priceRaw: input.page.price?.raw ?? null,
            rating: input.page.rating,
            reviewCount: input.page.reviewCount,
            seller: input.page.seller,
            availability: input.page.availability,
            delivery: input.page.delivery,
            returnPolicy: input.page.returnPolicy,
            intent: input.intent,
            verdict: decision.verdict,
            confidence: decision.confidence,
            summary: decision.summary,
            risks: decision.risks,
            checks: decision.checks,
            actionType: decision.action.type,
            model: decision.model,
            checkedAt: new Date().toISOString(),
            visibleTextExcerpt: input.page.visibleText.slice(0, 1500),
          },
        ],
      });
    } catch {
      // Agent memory must not break the approval-gated shopping flow.
    }
  }

  private async prepareMongoMemory(): Promise<void> {
    const client = await this.connect();
    if (!this.toolNames.length) {
      this.toolNames = await listMcpToolNamesFromClient(client, 20, 15_000);
    }
    if (this.prepared) return;

    await this.callTool("create-collection", {
      database: this.env.MONGODB_MEMORY_DATABASE,
      collection: this.env.MONGODB_MEMORY_COLLECTION,
    }).catch(ignoreAlreadyExists);

    await Promise.all([
      this.createClassicIndex("user_merchant_checkedAt", { userId: 1, merchant: 1, checkedAt: -1 }),
      this.createClassicIndex("url_checkedAt", { url: 1, checkedAt: -1 }),
      this.createClassicIndex("title_checkedAt", { title: 1, checkedAt: -1 }),
    ]);

    this.prepared = true;
  }

  private async createClassicIndex(name: string, keys: Record<string, 1 | -1>): Promise<void> {
    await this.callTool("create-index", {
      database: this.env.MONGODB_MEMORY_DATABASE,
      collection: this.env.MONGODB_MEMORY_COLLECTION,
      name,
      definition: [{ type: "classic", keys }],
    }).catch(ignoreAlreadyExists);
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const client = await this.connect();
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 12_000 });
    const text = hasContent(result) ? textContent(result).trim() : "";
    if ("isError" in result && result.isError) throw new Error(text || `MCP tool ${name} failed`);
    if (looksLikeMongoToolError(text)) throw new Error(`MCP tool ${name} failed: ${text}`);
    return result;
  }

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    this.connecting ??= this.createConnection().catch((error) => {
      this.connecting = null;
      throw error;
    });
    this.client = await this.connecting;
    return this.client;
  }

  private async createConnection(): Promise<Client> {
    return connectMcpClient({
      ...CLIENT_INFO,
      httpUrl: this.env.AGENT_MEMORY_MCP_HTTP_URL,
      command: this.env.AGENT_MEMORY_MCP_COMMAND || "npx",
      args: this.env.AGENT_MEMORY_MCP_ARGS ? splitMcpArgs(this.env.AGENT_MEMORY_MCP_ARGS) : [...DEFAULT_MONGODB_MCP_ARGS],
      env: {
        MDB_MCP_CONNECTION_STRING: this.env.MONGODB_MEMORY_CONNECTION_STRING,
        MDB_MCP_TELEMETRY: "disabled",
        MDB_MCP_LOGGERS: "stderr",
        MDB_MCP_INDEX_CHECK: "false",
      },
      timeoutMs: 15_000,
    });
  }
}

function disabledContext(env: Env): AgentMemoryContext {
  return baseContext(env, "disabled", ["Agent memory is disabled. Set AGENT_MEMORY_ENABLED=true to use MCP-backed product memory."]);
}

function baseContext(env: Env, status: AgentMemoryContext["status"], notes: string[] = []): AgentMemoryContext {
  return AgentMemoryContextSchema.parse({
    enabled: env.AGENT_MEMORY_ENABLED,
    backend: env.AGENT_MEMORY_BACKEND,
    provider: "MongoDB MCP Server",
    status,
    tools: [],
    similarProducts: [],
    notes,
  });
}

function parseProductMemory(result: McpToolResult): AgentMemoryProductMemory[] {
  if (!hasContent(result)) return [];
  return extractJsonArrays(textContent(result))
    .flat()
    .map((value) => AgentMemoryProductMemorySchema.safeParse(value))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .slice(0, 5);
}

function hasContent(result: McpToolResult): result is McpContentResult {
  return Array.isArray((result as { content?: unknown }).content);
}

function textContent(result: McpContentResult): string {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function extractJsonArrays(text: string): unknown[][] {
  const arrays: unknown[][] = [];
  const matches = text.match(/\[[\s\S]*?\]/g) ?? [];
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match);
      if (Array.isArray(parsed)) arrays.push(parsed);
    } catch {
      // Ignore non-JSON bracketed text from untrusted MCP result wrappers.
    }
  }
  return arrays;
}

function compactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Agent memory error: ${message.replace(/\s+/g, " ").slice(0, 180)}`;
}

function looksLikeMongoToolError(text: string): boolean {
  return /^(error|mongodb error|mongo server error|command failed|MongoServerError|IndexOptionsConflict|IndexKeySpecsConflict|NamespaceExists)\b/i.test(text);
}

function ignoreAlreadyExists(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (/already exists|IndexOptionsConflict|IndexKeySpecsConflict|NamespaceExists/i.test(message)) return;
  throw error;
}
