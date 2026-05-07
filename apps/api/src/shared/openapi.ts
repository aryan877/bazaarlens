import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import type { Express, Request, Response } from "express";
import type { Env } from "./env.js";

export function createOpenApiDocument(app: INestApplication, env: Env): OpenAPIObject {
  const swagger = new DocumentBuilder()
    .setTitle("BazaarLens API")
    .setDescription("Auth, analysis, approvals, and audit endpoints for BazaarLens.")
    .setVersion("0.1.0")
    .addServer(env.API_PUBLIC_URL, "Configured API URL")
    .addBearerAuth()
    .addApiKey(
      {
        type: "apiKey",
        name: "x-bazaarlens-a2a-key",
        in: "header",
        description: "Shared key used when registering BazaarLens as an A2A agent.",
      },
      "bazaarlensA2aKey",
    )
    .build();

  return SwaggerModule.createDocument(app, swagger, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey.replace(/Controller$/, "")}_${methodKey}`,
  });
}

export function setupOpenApi(app: INestApplication, env: Env): void {
  const document = createOpenApiDocument(app, env);
  SwaggerModule.setup("docs", app, document, {
    raw: ["json"],
    swaggerOptions: { persistAuthorization: true },
  });

  const express = app.getHttpAdapter().getInstance() as Express;
  express.get("/openapi.json", (_request: Request, response: Response) => response.json(document));
}
