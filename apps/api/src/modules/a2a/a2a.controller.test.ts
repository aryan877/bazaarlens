import type { Server } from "node:http";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentService } from "../agent/agent.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { getEnv } from "../../shared/env.js";
import { configureHttp } from "../../shared/http.js";

const originalEnv = { ...process.env };

describe("A2A controller", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("accepts application/a2a+json on the standard HTTP+JSON message endpoint", async () => {
    process.env = env();
    const analyze = vi.fn(async () => analyzeResponse());
    const { AppModule } = await import("../app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma())
      .overrideProvider(AgentService)
      .useValue({ analyze })
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureHttp(app, getEnv());
    await app.listen(0, "127.0.0.1");

    try {
      const address = (app.getHttpServer() as Server).address();
      if (!address || typeof address === "string") throw new Error("Expected test server to bind to a TCP port");
      const response = await fetch(`http://127.0.0.1:${address.port}/message:send`, {
        method: "POST",
        headers: {
          "content-type": "application/a2a+json",
          "x-bazaarlens-a2a-key": "a-32-plus-character-a2a-agent-key",
        },
        body: JSON.stringify({
          message: {
            role: "ROLE_USER",
            messageId: "msg-1",
            parts: [{ data: analyzeRequest(), mediaType: "application/json" }],
          },
        }),
      });

      expect(response.ok).toBe(true);
      const body = (await response.json()) as { task?: { status?: { state?: string } } };
      expect(body.task?.status?.state).toBe("completed");
      expect(analyze).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it("streams JSON-RPC message/stream responses as SSE", async () => {
    process.env = env();
    const analyze = vi.fn(async () => analyzeResponse());
    const { AppModule } = await import("../app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma())
      .overrideProvider(AgentService)
      .useValue({ analyze })
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureHttp(app, getEnv());
    await app.listen(0, "127.0.0.1");

    try {
      const address = (app.getHttpServer() as Server).address();
      if (!address || typeof address === "string") throw new Error("Expected test server to bind to a TCP port");
      const response = await fetch(`http://127.0.0.1:${address.port}/a2a`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bazaarlens-a2a-key": "a-32-plus-character-a2a-agent-key",
          "a2a-version": "0.3",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "stream-1",
          method: "message/stream",
          params: {
            message: {
              role: "user",
              messageId: "msg-1",
              parts: [{ kind: "data", data: analyzeRequest(), mediaType: "application/json" }],
            },
          },
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const body = await response.text();
      expect(body).toContain('"jsonrpc":"2.0"');
      expect(body).toContain('"kind":"task"');
      expect(body).toContain('"kind":"status-update"');
      expect(body).toContain('"final":true');
      expect(analyze).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it("streams HTTP+JSON message:stream responses as REST SSE", async () => {
    process.env = env();
    const analyze = vi.fn(async () => analyzeResponse());
    const { AppModule } = await import("../app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma())
      .overrideProvider(AgentService)
      .useValue({ analyze })
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureHttp(app, getEnv());
    await app.listen(0, "127.0.0.1");

    try {
      const address = (app.getHttpServer() as Server).address();
      if (!address || typeof address === "string") throw new Error("Expected test server to bind to a TCP port");
      const response = await fetch(`http://127.0.0.1:${address.port}/v1/message:stream`, {
        method: "POST",
        headers: {
          "content-type": "application/a2a+json",
          "x-bazaarlens-a2a-key": "a-32-plus-character-a2a-agent-key",
        },
        body: JSON.stringify({
          message: {
            role: "user",
            messageId: "msg-1",
            parts: [{ kind: "data", data: analyzeRequest(), mediaType: "application/json" }],
          },
        }),
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const body = await response.text();
      expect(body).toContain('"task"');
      expect(body).toContain('"statusUpdate"');
      expect(body).toContain('"kind":"status-update"');
      expect(analyze).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it("returns persisted tasks through REST and JSON-RPC task lookup", async () => {
    process.env = env();
    const session = persistedSession();
    const { AppModule } = await import("../app.module.js");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma(session))
      .overrideProvider(AgentService)
      .useValue({ analyze: vi.fn() })
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureHttp(app, getEnv());
    await app.listen(0, "127.0.0.1");

    try {
      const address = (app.getHttpServer() as Server).address();
      if (!address || typeof address === "string") throw new Error("Expected test server to bind to a TCP port");
      const rest = await fetch(`http://127.0.0.1:${address.port}/v1/tasks/${session.id}`, {
        headers: {
          "x-bazaarlens-a2a-key": "a-32-plus-character-a2a-agent-key",
        },
      });
      const rpc = await fetch(`http://127.0.0.1:${address.port}/a2a`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bazaarlens-a2a-key": "a-32-plus-character-a2a-agent-key",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "get-1",
          method: "tasks/get",
          params: {
            name: `tasks/${session.id}`,
            historyLength: 1,
          },
        }),
      });
      const invalidParams = await fetch(`http://127.0.0.1:${address.port}/a2a`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bazaarlens-a2a-key": "a-32-plus-character-a2a-agent-key",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "bad-params-1",
          method: "message/send",
          params: {},
        }),
      });
      const unknownMethod = await fetch(`http://127.0.0.1:${address.port}/a2a`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bazaarlens-a2a-key": "a-32-plus-character-a2a-agent-key",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "unknown-1",
          method: "tasks/unknown",
          params: {},
        }),
      });

      expect(rest.ok).toBe(true);
      expect(await rest.json()).toMatchObject({
        id: session.id,
        status: { state: "completed" },
        metadata: { verdict: "buy" },
      });
      expect(rpc.ok).toBe(true);
      expect(await rpc.json()).toMatchObject({
        jsonrpc: "2.0",
        id: "get-1",
        result: {
          id: session.id,
          kind: "task",
        },
      });
      expect(await invalidParams.json()).toMatchObject({
        jsonrpc: "2.0",
        id: "bad-params-1",
        error: {
          code: -32602,
          message: "Invalid params",
        },
      });
      expect(await unknownMethod.json()).toMatchObject({
        jsonrpc: "2.0",
        id: "unknown-1",
        error: {
          code: -32601,
          message: "Method not found",
          data: { method: "tasks/unknown" },
        },
      });
    } finally {
      await app.close();
    }
  });
});

function fakePrisma(session: ReturnType<typeof persistedSession> | null = null) {
  return {
    user: {
      upsert: vi.fn(async () => ({ id: "4a44b220-a577-4502-bc7d-ab789f90429d" })),
    },
    agentSession: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (session && where.id === session.id ? session : null)),
    },
  };
}

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...originalEnv,
    NODE_ENV: "development",
    API_PUBLIC_URL: "https://api.bazaarlens.app",
    CORS_ORIGIN: "https://bazaarlens.app",
    DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
    JWT_SECRET: "replace-with-a-strong-dev-secret",
    A2A_AGENT_KEY: "a-32-plus-character-a2a-agent-key",
    ...overrides,
  };
}

function analyzeRequest() {
  return {
    page: {
      url: "https://www.amazon.in/example/dp/B000000001",
      merchant: "amazon",
      title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
      price: {
        amount: 1299,
        currency: "INR",
        raw: "Rs 1,299",
      },
      mrp: null,
      discountText: null,
      rating: 4,
      reviewCount: 4200,
      seller: "Appario Retail Private Ltd",
      availability: "In stock",
      delivery: "Tomorrow",
      returnPolicy: "7 days replacement",
      selectedSize: null,
      images: [],
      breadcrumbs: ["Electronics", "Headphones"],
      visibleText: "boAt Airdopes 141 Bluetooth TWS Earbuds Rs 1,299",
      extractedAt: "2026-06-09T10:00:00.000Z",
    },
    intent: {
      query: "Should I buy this under Rs 1500?",
      budget: 1500,
      userContext: null,
    },
  };
}

function analyzeResponse() {
  return {
    sessionId: "4a44b220-a577-4502-bc7d-ab789f90429d",
    decision: {
      verdict: "buy",
      confidence: 0.82,
      summary: "Visible price and seller signals look acceptable.",
      reasons: ["Price is within budget."],
      risks: [],
      checks: ["Confirm warranty."],
      action: {
        type: "wishlist",
        label: "Save to wishlist",
        requiresApproval: true,
        payload: {},
      },
      model: "gemini-3.5-flash",
    },
  };
}

function persistedSession() {
  return {
    id: "4a44b220-a577-4502-bc7d-ab789f90429d",
    createdAt: new Date("2026-06-09T10:00:00.000Z"),
    decision: analyzeResponse().decision,
    productSnapshot: {
      merchant: "amazon",
      url: "https://www.amazon.in/example/dp/B000000001",
      title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
      priceAmount: 1299,
      priceRaw: "Rs 1,299",
      seller: "Appario Retail Private Ltd",
      availability: "In stock",
    },
  };
}
