import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { A2aModule } from "./a2a/a2a.module.js";
import { AgentModule } from "./agent/agent.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";
import { McpCapabilitiesModule } from "./mcp-capabilities/mcp-capabilities.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { getEnv } from "../shared/env.js";
import { buildThrottlerOptions } from "../shared/rate-limit.js";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    A2aModule,
    AgentModule,
    McpCapabilitiesModule,
    ThrottlerModule.forRootAsync({
      useFactory: () => buildThrottlerOptions(getEnv()),
    }),
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
