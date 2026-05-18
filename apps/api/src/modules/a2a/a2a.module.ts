import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { A2aController } from "./a2a.controller.js";
import { A2aKeyGuard } from "./a2a-key.guard.js";
import { A2aService } from "./a2a.service.js";

@Module({
  imports: [AgentModule, PrismaModule],
  controllers: [A2aController],
  providers: [A2aKeyGuard, A2aService],
})
export class A2aModule {}
