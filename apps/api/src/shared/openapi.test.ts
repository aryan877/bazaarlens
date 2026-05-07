import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { PrismaService } from "../modules/prisma/prisma.service.js";
import { getEnv } from "./env.js";
import { createOpenApiDocument } from "./openapi.js";

const originalEnv = { ...process.env };

describe("OpenAPI registration surface", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("documents agent analysis and A2A message endpoints with schemas and security", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      API_PUBLIC_URL: "https://api.bazaarlens.app",
      CORS_ORIGIN: "https://bazaarlens.app",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
      JWT_SECRET: "replace-with-a-strong-dev-secret",
      A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
    };

    const { AppModule } = await import("../modules/app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const document = createOpenApiDocument(app, getEnv());
      const paths = document.paths;
      const a2aMessagePath = Object.keys(paths).find((path) => path.includes("/a2a/message"));

      expect(document.servers?.[0]).toMatchObject({ url: "https://api.bazaarlens.app" });
      expect(document.components?.securitySchemes?.bazaarlensA2aKey).toMatchObject({
        type: "apiKey",
        in: "header",
        name: "x-bazaarlens-a2a-key",
      });
      expect(paths["/agent/analyze"]?.post?.requestBody).toMatchObject({
        content: {
          "application/json": {
            schema: expect.objectContaining({
              required: ["page", "intent"],
              properties: expect.objectContaining({
                page: expect.objectContaining({ type: "object" }),
                intent: expect.objectContaining({ type: "object" }),
              }),
            }),
          },
        },
      });
      expect(paths["/agent/analyze"]?.post?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: expect.objectContaining({
              properties: expect.objectContaining({
                evidenceContexts: expect.objectContaining({
                  type: "array",
                  maxItems: 5,
                }),
              }),
            }),
          },
        },
      });
      expect(paths["/.well-known/agent.json"]?.get).toBeTruthy();
      expect(paths["/.well-known/agent-card.json"]?.get).toBeTruthy();
      expect(paths["/.well-known/bazaarlens-submission.json"]?.get).toBeTruthy();
      expect(paths["/.well-known/bazaarlens-submission.json"]?.get?.security ?? []).toEqual([]);
      expect(paths["/ops/capabilities"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: expect.objectContaining({
              properties: expect.objectContaining({
                selectedTrack: expect.objectContaining({
                  enum: ["mongodb", "elastic", "arize", "fivetran", "gitlab", "dynatrace"],
                }),
                selectedConnector: expect.objectContaining({ nullable: true }),
                selectedTrackQualified: expect.objectContaining({ type: "boolean" }),
                connectors: expect.objectContaining({
                  type: "array",
                  items: expect.objectContaining({
                    properties: expect.objectContaining({
                      runtimePath: expect.objectContaining({ enum: ["agent-memory", "agent-evidence"] }),
                      mcpServer: expect.objectContaining({ type: "object" }),
                      qualificationEvidence: expect.objectContaining({ type: "array" }),
                    }),
                  }),
                }),
              }),
            }),
          },
        },
      });
      const connectorProviderEnum = (
        paths["/ops/capabilities"]?.get?.responses?.["200"] as {
          content?: {
            "application/json"?: {
              schema?: {
                properties?: {
                  connectors?: {
                    items?: {
                      properties?: {
                        provider?: {
                          enum?: string[];
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        }
      )?.content?.["application/json"]?.schema?.properties?.connectors?.items?.properties?.provider?.enum;
      expect(connectorProviderEnum).toEqual(["mongodb", "elastic", "arize", "fivetran", "gitlab", "dynatrace"]);
      expect(paths["/message:send"]?.post?.security).toContainEqual({ bazaarlensA2aKey: [] });
      expect(paths["/message:send"]?.post?.requestBody).toMatchObject({
        content: {
          "application/json": {
            schema: expect.objectContaining({
              required: ["message"],
            }),
          },
          "application/a2a+json": {
            schema: expect.objectContaining({
              required: ["message"],
            }),
          },
        },
      });
      expect(paths["/a2a"]?.post?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: expect.objectContaining({
              properties: expect.objectContaining({
                result: expect.objectContaining({
                  required: ["id", "contextId", "status", "kind"],
                }),
              }),
            }),
          },
        },
      });
      const jsonRpcMethodEnum = (
        paths["/a2a"]?.post?.requestBody as {
          content?: {
            "application/json"?: {
              schema?: {
                properties?: {
                  method?: {
                    enum?: string[];
                  };
                };
              };
            };
          };
        }
      )?.content?.["application/json"]?.schema?.properties?.method?.enum;
      expect(jsonRpcMethodEnum).toEqual([
        "SendMessage",
        "message/send",
        "message:send",
        "SendStreamingMessage",
        "message/stream",
        "message:stream",
        "GetTask",
        "tasks/get",
        "CancelTask",
        "tasks/cancel",
      ]);
      expect(paths["/v1/message:send"]?.post?.requestBody).toMatchObject({
        content: {
          "application/a2a+json": {
            schema: expect.objectContaining({
              required: ["message"],
            }),
          },
        },
      });
      expect(paths["/v1/message:stream"]?.post?.responses?.["201"] ?? paths["/v1/message:stream"]?.post?.responses?.["200"]).toBeTruthy();
      expect(paths["/v1/tasks/{id}"]?.get?.security).toContainEqual({ bazaarlensA2aKey: [] });
      expect(paths["/v1/tasks/{id}"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: expect.objectContaining({
              required: ["id", "contextId", "status", "kind"],
            }),
          },
        },
      });
      expect(a2aMessagePath).toBeTruthy();
      expect(paths[a2aMessagePath ?? ""]?.post?.security).toContainEqual({ bazaarlensA2aKey: [] });
      expect(paths[a2aMessagePath ?? ""]?.post?.requestBody).toMatchObject({
        content: {
          "application/json": {
            schema: expect.objectContaining({
              required: ["message"],
              properties: expect.objectContaining({
                message: expect.objectContaining({ type: "object" }),
              }),
            }),
          },
          "application/a2a+json": {
            schema: expect.objectContaining({
              required: ["message"],
              properties: expect.objectContaining({
                message: expect.objectContaining({ type: "object" }),
              }),
            }),
          },
        },
      });
      expect(JSON.stringify(document)).not.toContain("a-32-plus-character-a2a-agent-key");
    } finally {
      await app.close();
    }
  });
});
