import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { getEnv } from "../../shared/env.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { buildJwtModuleOptions } from "./jwt-options.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

const env = getEnv();

@Module({
  imports: [
    JwtModule.register(buildJwtModuleOptions(env)),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
