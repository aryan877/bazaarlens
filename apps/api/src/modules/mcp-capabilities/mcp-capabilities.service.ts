import { Injectable } from "@nestjs/common";
import {
  McpCapabilitiesResponseSchema,
  McpCapabilitySchema,
  type McpCapabilitiesResponse,
  type McpCapability,
} from "@bazaarlens/shared";
import { getEnv } from "../../shared/env.js";
import { mcpConnectorConfigs, selectedMcpConnectorConfig, type McpConnectorConfig } from "../mcp/mcp-connectors.js";
import { listMcpToolNames } from "../mcp/mcp-client.js";

@Injectable()
export class McpCapabilitiesService {
  private readonly env = getEnv();

  async readiness(options: { verify?: boolean } = {}): Promise<McpCapabilitiesResponse> {
    const verify = options.verify ?? this.env.MCP_READINESS_CHECKS_ENABLED;
    const connectors = await Promise.all(this.configs().map((config) => this.readConnector(config, verify)));
    const selectedConfig = selectedMcpConnectorConfig(this.env);
    const selectedConnector = connectors.find((connector) => connector.provider === selectedConfig?.provider) ?? null;

    return McpCapabilitiesResponseSchema.parse({
      checksEnabled: verify,
      generatedAt: new Date().toISOString(),
      selectedTrack: this.env.HACKATHON_TRACK,
      selectedConnector,
      selectedTrackQualified: selectedConnector ? isQualified(selectedConnector.status) : false,
      connectors,
    });
  }

  private async readConnector(config: McpConnectorConfig, verify: boolean): Promise<McpCapability> {
    if (!config.enabled) return capability(config, "disabled");
    if (!config.configured || !config.connection) return capability(config, "missing_config", ["Set the required environment variables to enable this connector."]);
    if (!verify) return capability(config, "configured");

    try {
      const tools = await listMcpToolNames(config.connection, 20);
      return capability(config, "available", [`${tools.length} MCP tool(s) visible.`], tools);
    } catch (error) {
      return capability(config, "error", [compactError(error)]);
    }
  }

  private configs(): McpConnectorConfig[] {
    return mcpConnectorConfigs(this.env);
  }
}

function capability(config: McpConnectorConfig, status: McpCapability["status"], extraNotes: string[] = [], tools: string[] = []): McpCapability {
  return McpCapabilitySchema.parse({
    provider: config.provider,
    label: config.label,
    purpose: config.purpose,
    runtimePath: config.runtimePath,
    mcpServer: config.mcpServer,
    qualificationEvidence: config.qualificationEvidence,
    status,
    transport: config.transport,
    tools,
    notes: [...config.notes, ...extraNotes].slice(0, 4),
  });
}

function compactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `MCP check failed: ${message.replace(/\s+/g, " ").slice(0, 180)}`;
}

function isQualified(status: McpCapability["status"]): boolean {
  return status === "configured" || status === "available";
}
