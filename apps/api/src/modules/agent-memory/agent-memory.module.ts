import { Module } from "@nestjs/common";
import { AgentMemoryService } from "./agent-memory.service.js";

@Module({
  providers: [AgentMemoryService],
  exports: [AgentMemoryService],
})
export class AgentMemoryModule {}
