import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, urlencoded } from "express";
import helmet from "helmet";
import type { Env } from "./env.js";
import { setupOpenApi } from "./openapi.js";

export const JSON_BODY_TYPES = ["application/json", "application/*+json"];

export function configureHttp(app: NestExpressApplication, env: Env): void {
  if (env.TRUST_PROXY_HOPS > 0) {
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
  }
  app.use(json({ type: JSON_BODY_TYPES }));
  app.use(urlencoded({ extended: true }));
  app.use(helmet());
  setupOpenApi(app, env);
}

export function corsOptions(env: Env) {
  if (!env.CORS_ORIGIN) return env.NODE_ENV === "production" ? false : true;
  return {
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
    credentials: true,
  };
}
