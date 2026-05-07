import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service.js";
import { McpCapabilitiesService } from "./mcp-capabilities/mcp-capabilities.service.js";
import { getEnv } from "../shared/env.js";

@Injectable()
export class HealthService {
  private readonly env = getEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpCapabilities?: McpCapabilitiesService,
  ) {}

  liveness() {
    return baseHealth();
  }

  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        ...baseHealth(false),
        checks: {
          database: "unavailable",
        },
      });
    }

    const connectedSystems = this.mcpCapabilities ? await this.mcpCapabilities.readiness({ verify: false }) : null;

    return {
      ...baseHealth(),
      checks: {
        database: "ok",
        ai:
          this.env.GOOGLE_VERTEX_API_KEY || this.env.GOOGLE_VERTEX_PROJECT || this.env.GOOGLE_CLOUD_PROJECT
            ? "google-vertex-configured"
            : "google-vertex-missing-config",
        agentMemory: this.env.AGENT_MEMORY_ENABLED ? `${this.env.AGENT_MEMORY_BACKEND}-enabled` : "disabled",
        connectedSystems,
        phoenixTracing: this.env.PHOENIX_TRACING_ENABLED ? "enabled" : "disabled",
        google: this.env.GOOGLE_CLIENT_ID ? "configured" : "not-configured",
        cors: this.env.CORS_ORIGIN ? "restricted" : "development-open",
      },
    };
  }
}

function baseHealth(ok = true) {
  return { ok, service: "bazaarlens-api", time: new Date().toISOString() };
}
