import { Module } from "@nestjs/common";
import { AgentObservabilityService } from "./agent-observability.service.js";

@Module({
  providers: [AgentObservabilityService],
  exports: [AgentObservabilityService],
})
export class AgentObservabilityModule {}
