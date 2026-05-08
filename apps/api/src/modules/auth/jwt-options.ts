import type { JwtModuleOptions } from "@nestjs/jwt";
import type { Env } from "../../shared/env.js";

type JwtEnv = Pick<Env, "JWT_SECRET" | "JWT_EXPIRES_IN">;
type JwtExpiresIn = NonNullable<JwtModuleOptions["signOptions"]>["expiresIn"];

export function buildJwtModuleOptions(env: JwtEnv): JwtModuleOptions {
  return {
    secret: env.JWT_SECRET,
    signOptions: {
      expiresIn: env.JWT_EXPIRES_IN as JwtExpiresIn,
    },
  };
}
