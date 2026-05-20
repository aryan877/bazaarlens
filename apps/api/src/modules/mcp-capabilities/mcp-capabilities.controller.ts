import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { mcpCapabilitiesResponseOpenApiSchema } from "../../shared/openapi-schemas.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { McpCapabilitiesService } from "./mcp-capabilities.service.js";

@ApiTags("ops")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ops")
export class McpCapabilitiesController {
  constructor(private readonly capabilities: McpCapabilitiesService) {}

  @Get("capabilities")
  @ApiOkResponse({ schema: mcpCapabilitiesResponseOpenApiSchema })
  readiness(@Query("verify") verify?: string) {
    return this.capabilities.readiness({ verify: parseVerify(verify) });
  }
}

function parseVerify(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}
