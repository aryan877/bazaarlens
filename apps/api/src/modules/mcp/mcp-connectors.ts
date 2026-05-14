import type { McpCapability, McpProvider } from "@bazaarlens/shared";
import type { Env } from "../../shared/env.js";
import { splitMcpArgs, type McpClientConfig } from "./mcp-client.js";
import { DEFAULT_MONGODB_MCP_ARGS, MONGODB_MCP_DOCKER_HTTP_LAUNCH, MONGODB_MCP_LAUNCH } from "./mongodb-mcp.js";

export interface McpConnectorConfig {
  readonly provider: McpProvider;
  readonly label: string;
  readonly purpose: string;
  readonly runtimePath: "agent-memory" | "agent-evidence";
  readonly mcpServer: {
    readonly implementation: string;
    readonly sourceUrl: string;
    readonly launch?: string;
  };
  readonly qualificationEvidence: string[];
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly transport: McpCapability["transport"];
  readonly connection?: McpClientConfig;
  readonly notes: string[];
}

export function mcpConnectorConfigs(env: Env): McpConnectorConfig[] {
  return [mongodb(env), elastic(env), arize(env), fivetran(env), gitlab(env), dynatrace(env)];
}

export function selectedMcpConnectorConfig(env: Env): McpConnectorConfig | undefined {
  return mcpConnectorConfigs(env).find((config) => config.provider === env.HACKATHON_TRACK);
}

function mongodb(env: Env): McpConnectorConfig {
  const configured = Boolean(env.AGENT_MEMORY_MCP_HTTP_URL || env.MONGODB_MEMORY_CONNECTION_STRING);
  return {
    provider: "mongodb",
    label: "MongoDB",
    purpose: "Product decision memory and user-specific buying context.",
    runtimePath: "agent-memory",
    mcpServer: {
      implementation: "Official MongoDB MCP Server",
      sourceUrl: "https://github.com/mongodb-js/mongodb-mcp-server",
      launch: env.AGENT_MEMORY_MCP_HTTP_URL ? MONGODB_MCP_DOCKER_HTTP_LAUNCH : MONGODB_MCP_LAUNCH,
    },
    qualificationEvidence: [
      "Reads prior user product decisions during analysis.",
      "Writes the new buying decision back to MongoDB-backed memory.",
    ],
    enabled: env.AGENT_MEMORY_ENABLED,
    configured,
    transport: env.AGENT_MEMORY_MCP_HTTP_URL ? "http" : configured ? "stdio" : "not_configured",
    connection: configured
      ? {
          name: "bazaarlens-mongodb-capability",
          httpUrl: env.AGENT_MEMORY_MCP_HTTP_URL,
          command: env.AGENT_MEMORY_MCP_COMMAND || "npx",
          args: env.AGENT_MEMORY_MCP_ARGS
            ? splitMcpArgs(env.AGENT_MEMORY_MCP_ARGS)
            : [...DEFAULT_MONGODB_MCP_ARGS],
          env: {
            MDB_MCP_CONNECTION_STRING: env.MONGODB_MEMORY_CONNECTION_STRING,
            MDB_MCP_TELEMETRY: "disabled",
            MDB_MCP_LOGGERS: "stderr",
            MDB_MCP_INDEX_CHECK: "false",
          },
          timeoutMs: env.MCP_READINESS_TIMEOUT_MS,
        }
      : undefined,
    notes: ["Used by the live analysis flow when agent memory is enabled."],
  };
}

function elastic(env: Env): McpConnectorConfig {
  const httpUrl = env.ELASTIC_MCP_HTTP_URL || elasticAgentBuilderUrl(env);
  const apiKey = env.ELASTIC_API_KEY || env.ES_API_KEY;
  const configured = Boolean(httpUrl || (env.ELASTIC_MCP_COMMAND && env.ELASTIC_MCP_ARGS));
  const hasAuth = Boolean(apiKey || (env.ES_USERNAME && env.ES_PASSWORD));
  return {
    provider: "elastic",
    label: "Elastic",
    purpose: "Search indexed product, price, and deal evidence during buying checks.",
    runtimePath: "agent-evidence",
    mcpServer: {
      implementation: "Elastic Agent Builder MCP or Elasticsearch MCP Server",
      sourceUrl: "https://github.com/elastic/gemini-cli-elasticsearch",
      launch: "Elastic Agent Builder /api/agent_builder/mcp endpoint",
    },
    qualificationEvidence: [
      "Queries product, price, and deal indices when an index or custom search tool is configured.",
      "Adds retrieved market evidence to the Gemini buying prompt.",
    ],
    enabled: env.ELASTIC_MCP_ENABLED,
    configured: configured && hasAuth,
    transport: httpUrl ? "http" : configured ? "stdio" : "not_configured",
    connection:
      configured && hasAuth
        ? {
            name: "bazaarlens-elastic-capability",
            httpUrl,
            headers: apiKey ? { Authorization: `ApiKey ${apiKey}` } : undefined,
            command: env.ELASTIC_MCP_COMMAND || undefined,
            args: env.ELASTIC_MCP_ARGS ? splitMcpArgs(env.ELASTIC_MCP_ARGS) : [],
            env: {
              KIBANA_URL: env.ELASTIC_KIBANA_URL,
              AUTH_HEADER: apiKey ? `ApiKey ${apiKey}` : undefined,
              ES_URL: env.ES_URL,
              ES_API_KEY: apiKey,
              ES_USERNAME: env.ES_USERNAME,
              ES_PASSWORD: env.ES_PASSWORD,
              ES_SSL_SKIP_VERIFY: env.ES_SSL_SKIP_VERIFY ? "true" : "false",
            },
            timeoutMs: env.MCP_READINESS_TIMEOUT_MS,
          }
        : undefined,
    notes: [
      env.ELASTIC_PRODUCT_INDEX || env.ELASTIC_PRODUCT_SEARCH_TOOL
        ? "Runtime analysis can query Elastic for product/deal evidence."
        : "Set ELASTIC_PRODUCT_INDEX or ELASTIC_PRODUCT_SEARCH_TOOL to use Elastic during product checks.",
    ],
  };
}

function arize(env: Env): McpConnectorConfig {
  const configured = Boolean(env.PHOENIX_HOST && env.PHOENIX_API_KEY);
  return {
    provider: "arize",
    label: "Arize Phoenix",
    purpose: "Agent trace, span, session, prompt, and evaluation evidence.",
    runtimePath: "agent-evidence",
    mcpServer: {
      implementation: "Arize Phoenix MCP Server",
      sourceUrl: "https://github.com/Arize-ai/phoenix",
      launch: "npx @arizeai/phoenix-mcp@latest",
    },
    qualificationEvidence: [
      "Exports BazaarLens agent traces through OpenTelemetry when Phoenix tracing is enabled.",
      "Reads Phoenix projects and recent traces through MCP for runtime evaluation evidence.",
    ],
    enabled: env.ARIZE_MCP_ENABLED,
    configured,
    transport: configured ? "stdio" : "not_configured",
    connection: configured
      ? {
          name: "bazaarlens-arize-capability",
          command: env.ARIZE_MCP_COMMAND || "npx",
          args: env.ARIZE_MCP_ARGS
            ? splitMcpArgs(env.ARIZE_MCP_ARGS)
            : [
                "-y",
                "@arizeai/phoenix-mcp@latest",
                "--baseUrl",
                env.PHOENIX_HOST,
                "--apiKey",
                env.PHOENIX_API_KEY,
                ...(env.PHOENIX_PROJECT ? ["--project", env.PHOENIX_PROJECT] : []),
              ],
          env: {
            PHOENIX_HOST: env.PHOENIX_HOST,
            PHOENIX_API_KEY: env.PHOENIX_API_KEY,
            PHOENIX_PROJECT: env.PHOENIX_PROJECT,
          },
          timeoutMs: env.MCP_READINESS_TIMEOUT_MS,
        }
      : undefined,
    notes: [
      env.PHOENIX_TRACING_ENABLED
        ? "BazaarLens agent traces are exported to Phoenix when analysis runs."
        : "Enable PHOENIX_TRACING_ENABLED=true to export live BazaarLens agent traces.",
    ],
  };
}

function fivetran(env: Env): McpConnectorConfig {
  const configured = Boolean(env.FIVETRAN_API_KEY && env.FIVETRAN_API_SECRET);
  return {
    provider: "fivetran",
    label: "Fivetran",
    purpose: "Data-pipeline status evidence for catalog, price, and operations feeds.",
    runtimePath: "agent-evidence",
    mcpServer: {
      implementation: "Official Fivetran MCP Server",
      sourceUrl: "https://github.com/fivetran/fivetran-mcp",
      launch: "uvx --from git+https://github.com/fivetran/fivetran-mcp fivetran-mcp",
    },
    qualificationEvidence: [
      "Reads account, connection, destination, and group inventory from Fivetran.",
      "Keeps writes disabled by default; write tools require explicit operator approval.",
    ],
    enabled: env.FIVETRAN_MCP_ENABLED,
    configured,
    transport: configured ? "stdio" : "not_configured",
    connection: configured
      ? {
          name: "bazaarlens-fivetran-capability",
          command: env.FIVETRAN_MCP_COMMAND || "uvx",
          args: env.FIVETRAN_MCP_ARGS
            ? splitMcpArgs(env.FIVETRAN_MCP_ARGS)
            : ["--from", "git+https://github.com/fivetran/fivetran-mcp", "fivetran-mcp"],
          env: {
            FIVETRAN_API_KEY: env.FIVETRAN_API_KEY,
            FIVETRAN_API_SECRET: env.FIVETRAN_API_SECRET,
            FIVETRAN_ALLOW_WRITES: env.FIVETRAN_ALLOW_WRITES ? "true" : "false",
          },
          timeoutMs: env.MCP_READINESS_TIMEOUT_MS,
        }
      : undefined,
    notes: [
      env.FIVETRAN_ALLOW_WRITES
        ? "Write tools are enabled; use only with explicit operator approval."
        : "Fivetran MCP is read-only by default for safe pipeline evidence.",
    ],
  };
}

function gitlab(env: Env): McpConnectorConfig {
  const httpUrl = env.GITLAB_MCP_HTTP_URL;
  const configured = Boolean(env.GITLAB_PROJECT_ID && env.GITLAB_MCP_AUTH_READY && (httpUrl || (env.GITLAB_MCP_COMMAND && env.GITLAB_MCP_ARGS)));
  return {
    provider: "gitlab",
    label: "GitLab",
    purpose: "DevSecOps evidence for extractor issues, release readiness, and agent delivery workflow.",
    runtimePath: "agent-evidence",
    mcpServer: {
      implementation: "GitLab Duo MCP Server",
      sourceUrl: "https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/",
      launch: "OAuth-authenticated GitLab MCP endpoint",
    },
    qualificationEvidence: [
      "Reads issue and pipeline evidence for the configured BazaarLens project.",
      "Requires OAuth-ready MCP auth before the GitLab track can be claimed.",
    ],
    enabled: env.GITLAB_MCP_ENABLED,
    configured,
    transport: httpUrl ? "http" : configured ? "stdio" : "not_configured",
    connection: configured
      ? {
          name: "bazaarlens-gitlab-capability",
          httpUrl,
          command: env.GITLAB_MCP_COMMAND || undefined,
          args: env.GITLAB_MCP_ARGS ? splitMcpArgs(env.GITLAB_MCP_ARGS) : [],
          timeoutMs: env.MCP_READINESS_TIMEOUT_MS,
        }
      : undefined,
    notes: [
      env.GITLAB_PROJECT_ID
        ? "GitLab MCP can read release, issue, and pipeline evidence from the configured project."
        : "Set GITLAB_PROJECT_ID plus an OAuth-authenticated MCP session or proxy before claiming this track.",
    ],
  };
}

function dynatrace(env: Env): McpConnectorConfig {
  const httpUrl = dynatraceMcpUrl(env);
  const configured = Boolean(httpUrl && env.DYNATRACE_API_TOKEN);
  return {
    provider: "dynatrace",
    label: "Dynatrace",
    purpose: "Production telemetry, DQL, vulnerability, and runtime behavior evidence for the agent.",
    runtimePath: "agent-evidence",
    mcpServer: {
      implementation: "Dynatrace MCP Server",
      sourceUrl: "https://docs.dynatrace.com/docs/dynatrace-intelligence/dynatrace-mcp",
      launch: "Dynatrace MCP gateway streamable HTTP endpoint",
    },
    qualificationEvidence: [
      "Reads live runtime and reliability evidence through the Dynatrace MCP gateway.",
      "Feeds observability context into buying-check risk assessment when enabled.",
    ],
    enabled: env.DYNATRACE_MCP_ENABLED,
    configured,
    transport: httpUrl ? "http" : "not_configured",
    connection: configured
      ? {
          name: "bazaarlens-dynatrace-capability",
          httpUrl,
          headers: { Authorization: `Bearer ${env.DYNATRACE_API_TOKEN}` },
          timeoutMs: env.MCP_READINESS_TIMEOUT_MS,
        }
      : undefined,
    notes: ["Dynatrace MCP gives the agent runtime and observability evidence when a platform token is configured."],
  };
}

function elasticAgentBuilderUrl(env: Env): string {
  if (!env.ELASTIC_KIBANA_URL) return "";
  const baseUrl = env.ELASTIC_KIBANA_URL.replace(/\/+$/, "");
  const space = env.ELASTIC_KIBANA_SPACE ? `/s/${encodeURIComponent(env.ELASTIC_KIBANA_SPACE)}` : "";
  return `${baseUrl}${space}/api/agent_builder/mcp`;
}

function dynatraceMcpUrl(env: Env): string {
  if (env.DYNATRACE_MCP_HTTP_URL) return env.DYNATRACE_MCP_HTTP_URL;
  if (!env.DYNATRACE_ENVIRONMENT_URL) return "";
  const baseUrl = env.DYNATRACE_ENVIRONMENT_URL.replace(/\/+$/, "");
  return `${baseUrl}/platform-reserved/mcp-gateway/v0.1/servers/dynatrace-mcp/mcp`;
}
