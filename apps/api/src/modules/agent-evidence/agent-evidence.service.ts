import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  AgentEvidenceContextSchema,
  type AgentEvidenceContext,
  type AnalyzeRequest,
  type McpCapability,
  type McpProvider,
} from "@bazaarlens/shared";
import { getEnv } from "../../shared/env.js";
import { connectMcpClient, listMcpToolNamesFromClient } from "../mcp/mcp-client.js";
import { mcpConnectorConfigs, selectedMcpConnectorConfig, type McpConnectorConfig } from "../mcp/mcp-connectors.js";

type McpToolResult = Awaited<ReturnType<Client["callTool"]>>;
type McpContentResult = McpToolResult & Pick<CallToolResult, "content">;

@Injectable()
export class AgentEvidenceService implements OnModuleDestroy {
  private readonly env = getEnv();
  private readonly clients = new Map<McpProvider, Client>();
  private readonly connecting = new Map<McpProvider, Promise<Client>>();
  private readonly toolNames = new Map<McpProvider, string[]>();

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.clients.values()].map((client) => client.close().catch(() => undefined)));
    this.clients.clear();
    this.connecting.clear();
    this.toolNames.clear();
  }

  async contextForAnalysis(input: AnalyzeRequest): Promise<AgentEvidenceContext | undefined> {
    return (await this.contextsForAnalysis(input))[0];
  }

  async contextsForAnalysis(input: AnalyzeRequest): Promise<AgentEvidenceContext[]> {
    const configs = this.configsForAnalysis();
    if (!configs.length) return [];
    const contexts = await Promise.all(configs.map((config) => this.contextForConfig(config, input)));
    return contexts.filter((context): context is AgentEvidenceContext => Boolean(context));
  }

  private configsForAnalysis(): McpConnectorConfig[] {
    const configs = mcpConnectorConfigs(this.env);
    const selected = selectedMcpConnectorConfig(this.env);
    const selector = this.env.AGENT_EVIDENCE_PROVIDERS.toLowerCase();
    const requested = splitList(selector);
    const ordered = new Map<McpProvider, McpConnectorConfig>();
    const add = (config: McpConnectorConfig | undefined) => {
      if (!config || config.provider === "mongodb") return;
      ordered.set(config.provider, config);
    };

    if (!requested.includes("all") || selected?.enabled) add(selected);

    if (!requested.length) return [...ordered.values()].slice(0, 5);

    if (requested.includes("all")) {
      for (const config of configs) {
        if (config.provider !== "mongodb" && config.enabled) add(config);
      }
      return [...ordered.values()].slice(0, 5);
    }

    for (const provider of requested) {
      add(configs.find((config) => config.provider === provider));
    }
    return [...ordered.values()].slice(0, 5);
  }

  private async contextForConfig(config: McpConnectorConfig, input: AnalyzeRequest): Promise<AgentEvidenceContext | undefined> {
    if (!config || config.provider === "mongodb") return undefined;
    if (!config.enabled) return evidence(config, "disabled");
    if (!config.configured || !config.connection) {
      return evidence(config, "missing_config", [`${config.label} MCP is not configured for runtime evidence.`]);
    }

    try {
      const tools = await this.listTools(config);
      if (config.provider === "arize") {
        return evidence(config, "available", await this.arizeNotes(config, input, tools), tools);
      }
      if (config.provider === "elastic") {
        const elastic = await this.elasticEvidence(config, input, tools);
        return evidence(config, elastic.status, elastic.notes, tools);
      }
      if (config.provider === "fivetran") {
        const fivetran = await this.fivetranEvidence(config, input, tools);
        return evidence(config, fivetran.status, fivetran.notes, tools);
      }
      if (config.provider === "gitlab") {
        const gitlab = await this.gitlabEvidence(config, input, tools);
        return evidence(config, gitlab.status, gitlab.notes, tools);
      }
      if (config.provider === "dynatrace") {
        return evidence(config, "available", this.operationalEvidenceNotes(config, input, tools), tools);
      }
      return evidence(config, "available", [`${config.label} MCP is reachable for the selected ${config.provider} track.`], tools);
    } catch (error) {
      return evidence(config, "error", [compactError(error)]);
    }
  }

  private async arizeNotes(config: McpConnectorConfig, input: AnalyzeRequest, tools: string[]): Promise<string[]> {
    const notes = [`Arize Phoenix MCP is reachable for this ${input.page.merchant} product check.`];

    if (tools.includes("list-projects")) {
      const result = await this.callTool(config, "list-projects", {
        limit: 3,
        include_experiment_projects: false,
      });
      const count = countStructuredItems(textContentIfPresent(result));
      notes.push(count === null ? "Phoenix project lookup completed." : `Phoenix returned ${count} project(s) for trace review.`);
    }

    if (this.env.PHOENIX_PROJECT && tools.includes("list-traces")) {
      const result = await this.callTool(config, "list-traces", {
        project_identifier: this.env.PHOENIX_PROJECT,
        limit: 3,
        last_n_minutes: 120,
        include_annotations: false,
      });
      const count = countStructuredItems(textContentIfPresent(result));
      notes.push(count === null ? "Recent trace lookup completed." : `Phoenix returned ${count} recent trace(s) for the configured project.`);
    }

    return notes.slice(0, 5);
  }

  private async elasticEvidence(
    config: McpConnectorConfig,
    input: AnalyzeRequest,
    tools: string[],
  ): Promise<{ status: McpCapability["status"]; notes: string[] }> {
    const notes = [`Elastic MCP is reachable for this ${input.page.merchant} product check.`];
    const productIndex = this.env.ELASTIC_PRODUCT_INDEX;
    const customTool = this.env.ELASTIC_PRODUCT_SEARCH_TOOL;

    if (productIndex && tools.includes("search")) {
      const result = await this.callTool(config, "search", {
        index: productIndex,
        fields: splitList(this.env.ELASTIC_PRODUCT_SOURCE_FIELDS),
        query_body: elasticProductQuery(input),
      });
      const text = textContentIfPresent(result);
      const count = countStructuredItems(text);
      notes.push(...productEvidenceNotes("Elastic", text));
      notes.push(count === null ? "Elastic product search completed." : `Elastic returned ${count} indexed product/deal result(s).`);
      return { status: "available", notes };
    }

    if (customTool && tools.includes(customTool)) {
      const result = await this.callTool(config, customTool, {
        query: elasticProductSearchText(input),
        merchant: input.page.merchant,
        title: input.page.title,
        budget: input.intent.budget,
        limit: 3,
      });
      const text = textContentIfPresent(result);
      const count = countStructuredItems(text);
      notes.push(...productEvidenceNotes("Elastic", text));
      notes.push(count === null ? `Elastic custom tool ${customTool} completed.` : `Elastic custom tool ${customTool} returned ${count} result(s).`);
      return { status: "available", notes };
    }

    if (productIndex && tools.includes("list_indices")) {
      const result = await this.callTool(config, "list_indices", { index_pattern: productIndex });
      const count = countStructuredItems(textContentIfPresent(result));
      notes.push(count === null ? `Elastic checked product index pattern ${productIndex}.` : `Elastic found ${count} matching product index pattern(s).`);
      if (tools.includes("get_mappings")) {
        await this.callTool(config, "get_mappings", { index: productIndex });
        notes.push("Elastic product index mapping lookup completed.");
      }
      return { status: "available", notes };
    }

    notes.push(
      customTool
        ? `Elastic product search tool ${customTool} is not exposed by MCP.`
        : "Set ELASTIC_PRODUCT_INDEX or ELASTIC_PRODUCT_SEARCH_TOOL to run product evidence lookup.",
    );
    return { status: "configured", notes };
  }

  private async fivetranEvidence(
    config: McpConnectorConfig,
    input: AnalyzeRequest,
    tools: string[],
  ): Promise<{ status: McpCapability["status"]; notes: string[] }> {
    const notes = [`Fivetran MCP is reachable for ${input.page.merchant} pipeline evidence.`];
    const inventory: string[] = [];

    if (tools.includes("get_account_info")) {
      const result = await this.callTool(config, "get_account_info", {
        schema_file: "open-api-definitions/account/get_account_info.json",
      });
      notes.push(textContentIfPresent(result) ? "Fivetran account lookup completed." : "Fivetran account tool returned no text.");
    }

    if (tools.includes("list_connections")) {
      const result = await this.callTool(config, "list_connections", {
        schema_file: "open-api-definitions/connections/list_connections.json",
      });
      const count = countStructuredItems(textContentIfPresent(result));
      inventory.push(count === null ? "connection inventory checked" : `${count} connection(s)`);
    }

    if (tools.includes("list_destinations")) {
      const result = await this.callTool(config, "list_destinations", {
        schema_file: "open-api-definitions/destinations/list_destinations.json",
      });
      const count = countStructuredItems(textContentIfPresent(result));
      inventory.push(count === null ? "destination inventory checked" : `${count} destination(s)`);
    }

    if (tools.includes("list_groups")) {
      const result = await this.callTool(config, "list_groups", {
        schema_file: "open-api-definitions/groups/list_all_groups.json",
      });
      const count = countStructuredItems(textContentIfPresent(result));
      inventory.push(count === null ? "group inventory checked" : `${count} group(s)`);
    }

    if (inventory.length) {
      notes.push(`Fivetran inventory returned ${inventory.join(", ")}.`);
    }

    if (!tools.some((tool) => ["get_account_info", "list_connections", "list_destinations", "list_groups"].includes(tool))) {
      notes.push("Fivetran MCP is connected, but account, connection, destination, and group read tools were not exposed.");
      return { status: "configured", notes };
    }

    return { status: "available", notes };
  }

  private async gitlabEvidence(
    config: McpConnectorConfig,
    input: AnalyzeRequest,
    tools: string[],
  ): Promise<{ status: McpCapability["status"]; notes: string[] }> {
    const notes = [`GitLab MCP is reachable for release and extractor workflow evidence tied to ${input.page.merchant}.`];
    const projectId = this.env.GITLAB_PROJECT_ID;

    if (tools.includes("get_mcp_server_version")) {
      await this.callTool(config, "get_mcp_server_version", {});
      notes.push("GitLab MCP server version lookup completed.");
    }

    if (projectId && tools.includes("search")) {
      const result = await this.callTool(config, "search", {
        project_id: projectId,
        scope: "issues",
        state: "opened",
        search: gitlabSearchText(input),
        per_page: 3,
        page: 1,
      });
      const count = countStructuredItems(textContentIfPresent(result));
      notes.push(count === null ? "GitLab issue search completed for product extractor evidence." : `GitLab returned ${count} open issue result(s).`);
    }

    if (projectId && tools.includes("manage_pipeline")) {
      const result = await this.callTool(config, "manage_pipeline", {
        id: projectId,
        list: true,
        per_page: 3,
        page: 1,
      });
      const count = countStructuredItems(textContentIfPresent(result));
      notes.push(count === null ? "GitLab pipeline inventory lookup completed." : `GitLab returned ${count} recent pipeline result(s).`);
    }

    if (!tools.some((tool) => ["get_mcp_server_version", "search", "manage_pipeline"].includes(tool))) {
      notes.push("GitLab MCP is connected, but version, search, and pipeline read tools were not exposed.");
      return { status: "configured", notes };
    }

    return { status: "available", notes };
  }

  private operationalEvidenceNotes(config: McpConnectorConfig, input: AnalyzeRequest, tools: string[]): string[] {
    return [
      `Dynatrace MCP is reachable for runtime and reliability evidence tied to ${input.page.merchant}.`,
      `${tools.length} Dynatrace tool(s) are visible for telemetry-backed checks.`,
    ];
  }

  private async listTools(config: McpConnectorConfig): Promise<string[]> {
    const cached = this.toolNames.get(config.provider);
    if (cached) return cached;

    const client = await this.connect(config);
    const names = await listMcpToolNamesFromClient(client, 20, config.connection?.timeoutMs ?? 15_000);
    this.toolNames.set(config.provider, names);
    return names;
  }

  private async callTool(config: McpConnectorConfig, name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const client = await this.connect(config);
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 12_000 });
    const text = hasContent(result) ? textContent(result).trim() : "";
    if ("isError" in result && result.isError) throw new Error(text || `MCP tool ${name} failed`);
    if (looksLikeToolError(text)) throw new Error(`MCP tool ${name} failed: ${text}`);
    return result;
  }

  private async connect(config: McpConnectorConfig): Promise<Client> {
    const cached = this.clients.get(config.provider);
    if (cached) return cached;
    if (!config.connection) throw new Error(`${config.label} MCP connection is not configured`);

    let connecting = this.connecting.get(config.provider);
    if (!connecting) {
      connecting = connectMcpClient(config.connection).catch((error) => {
        this.connecting.delete(config.provider);
        throw error;
      });
      this.connecting.set(config.provider, connecting);
    }

    const client = await connecting;
    this.clients.set(config.provider, client);
    return client;
  }
}

function evidence(
  config: McpConnectorConfig,
  status: McpCapability["status"],
  notes: string[] = [],
  tools: string[] = [],
): AgentEvidenceContext {
  return AgentEvidenceContextSchema.parse({
    provider: config.provider,
    label: config.label,
    purpose: config.purpose,
    runtimePath: config.runtimePath,
    mcpServer: config.mcpServer,
    qualificationEvidence: config.qualificationEvidence,
    status,
    transport: config.transport,
    tools,
    notes: [...config.notes, ...notes].slice(0, 5),
    generatedAt: new Date().toISOString(),
  });
}

function hasContent(result: McpToolResult): result is McpContentResult {
  return Array.isArray((result as { content?: unknown }).content);
}

function textContentIfPresent(result: McpToolResult): string {
  return hasContent(result) ? textContent(result) : "";
}

function textContent(result: McpContentResult): string {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function countStructuredItems(text: string): number | null {
  const parsed = firstJsonValue(text);
  if (!parsed) return null;
  if (Array.isArray(parsed)) return parsed.length;
  if (typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  for (const key of ["data", "projects", "traces", "sessions", "items", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) return value.length;
    if (key === "data" && value && typeof value === "object") {
      const data = value as Record<string, unknown>;
      if (typeof data._total_items === "number") return data._total_items;
      if (Array.isArray(data.items)) return data.items.length;
    }
  }
  const items = structuredItems(parsed);
  if (items.length) return items.length;
  return null;
}

interface ProductEvidenceItem {
  readonly title?: string;
  readonly price?: string;
  readonly seller?: string;
  readonly rating?: string;
  readonly discount?: string;
  readonly source?: string;
}

function productEvidenceNotes(source: string, text: string): string[] {
  return structuredItems(firstJsonValue(text))
    .map(productEvidenceItem)
    .filter((item): item is ProductEvidenceItem => Boolean(item))
    .slice(0, 2)
    .map((item, index) => formatProductEvidenceNote(source, item, index + 1));
}

function structuredItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  if (record._source && typeof record._source === "object") return [record._source];

  const hits = objectValue(record.hits);
  const hitItems = arrayValue(hits?.hits).map((item) => objectValue(item)?._source ?? item);
  if (hitItems.length) return hitItems;

  for (const key of ["data", "products", "deals", "items", "results", "matches", "records"]) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested;
    if (nested && typeof nested === "object") {
      const items = structuredItems(nested);
      if (items.length) return items;
    }
  }

  return [];
}

function productEvidenceItem(value: unknown): ProductEvidenceItem | null {
  const record = objectValue(value);
  if (!record) return null;
  const source = objectValue(record._source) ?? objectValue(record.fields) ?? record;
  const item: ProductEvidenceItem = {
    title: firstField(source, ["title", "name", "productTitle", "product_name", "product"]),
    price: firstField(source, ["priceRaw", "price", "salePrice", "currentPrice", "discountedPrice", "sellingPrice", "priceAmount"]),
    seller: firstField(source, ["seller", "sellerName", "retailer", "brand"]),
    rating: firstField(source, ["rating", "averageRating", "stars"]),
    discount: firstField(source, ["discountText", "discount", "offer"]),
    source: firstField(source, ["merchant", "store", "site", "source"]),
  };

  return Object.values(item).some(Boolean) ? item : null;
}

function formatProductEvidenceNote(source: string, item: ProductEvidenceItem, position: number): string {
  const parts = [
    item.title,
    item.price ? `price ${item.price}` : null,
    item.seller ? `seller ${item.seller}` : null,
    item.rating ? `rating ${item.rating}` : null,
    item.discount ? `deal ${item.discount}` : null,
    item.source ? `source ${item.source}` : null,
  ].filter(Boolean);
  return truncate(`${source} match ${position}: ${parts.join(" - ")}`, 220);
}

function firstField(record: Record<string, unknown>, names: string[]): string | undefined {
  for (const name of names) {
    const value = compactScalar(record[name]);
    if (value) return value;
  }
  return undefined;
}

function compactScalar(value: unknown): string | undefined {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (typeof scalar === "number" && Number.isFinite(scalar)) return String(scalar);
  if (typeof scalar !== "string") return undefined;
  const compact = scalar.replace(/\s+/g, " ").trim();
  return compact || undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function elasticProductQuery(input: AnalyzeRequest): Record<string, unknown> {
  const query = elasticProductSearchText(input);
  const should: Record<string, unknown>[] = [
    {
      multi_match: {
        query,
        fields: ["title^4", "brand^2", "seller^2", "merchant", "breadcrumbs", "description", "visibleText"],
        fuzziness: "AUTO",
      },
    },
    { term: { merchant: input.page.merchant } },
  ];
  if (input.page.price?.amount) {
    should.push({
      range: {
        priceAmount: {
          gte: Math.max(0, Math.floor(input.page.price.amount * 0.75)),
          lte: Math.ceil(input.page.price.amount * 1.25),
        },
      },
    });
  }
  if (input.intent.budget) {
    should.push({ range: { priceAmount: { lte: Math.ceil(input.intent.budget) } } });
  }

  return {
    size: 3,
    query: {
      bool: {
        should,
        minimum_should_match: 1,
      },
    },
    sort: [{ _score: "desc" }],
  };
}

function elasticProductSearchText(input: AnalyzeRequest): string {
  return [
    input.page.title,
    input.page.seller,
    input.page.breadcrumbs.join(" "),
    input.intent.query,
    input.intent.budget ? `budget ${input.intent.budget}` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function gitlabSearchText(input: AnalyzeRequest): string {
  return ["extractor", input.page.merchant, input.page.title]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function firstJsonValue(text: string): unknown | null {
  const candidates = [text.trim(), ...(text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/g) ?? [])];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // MCP tools often wrap JSON in prose; keep looking for a parseable body.
    }
  }
  return null;
}

function compactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `MCP evidence error: ${message.replace(/\s+/g, " ").slice(0, 180)}`;
}

function truncate(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

function looksLikeToolError(text: string): boolean {
  return /^(error|fivetran api error|invalid schema_file)\b/i.test(text);
}
