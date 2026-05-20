import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { McpCapabilitiesController } from "./mcp-capabilities.controller.js";
import { McpCapabilitiesService } from "./mcp-capabilities.service.js";

@Module({
  imports: [AuthModule],
  controllers: [McpCapabilitiesController],
  providers: [McpCapabilitiesService],
  exports: [McpCapabilitiesService],
})
export class McpCapabilitiesModule {}
