import { Module } from "@nestjs/common";
import { AgentController } from "./agent.controller.js";
import { AgentService } from "./agent.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { AgentEvidenceModule } from "../agent-evidence/agent-evidence.module.js";
import { AgentMemoryModule } from "../agent-memory/agent-memory.module.js";
import { AgentObservabilityModule } from "../agent-observability/agent-observability.module.js";

@Module({
  imports: [AuthModule, AgentMemoryModule, AgentObservabilityModule, AgentEvidenceModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
