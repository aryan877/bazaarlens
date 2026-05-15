import { Module } from "@nestjs/common";
import { AgentEvidenceService } from "./agent-evidence.service.js";

@Module({
  providers: [AgentEvidenceService],
  exports: [AgentEvidenceService],
})
export class AgentEvidenceModule {}
