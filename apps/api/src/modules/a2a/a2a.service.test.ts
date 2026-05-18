import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentService } from "../agent/agent.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { A2aService } from "./a2a.service.js";

const originalEnv = { ...process.env };

describe("A2aService", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("publishes a Gemini Enterprise registerable agent card without secrets", () => {
    process.env = env();

    const card = new A2aService(fakePrisma(), fakeAgent()).agentCard();

    expect(card.name).toBe("BazaarLens");
    expect(card.protocolVersion).toBe("0.3");
    expect(card.url).toBe("https://api.bazaarlens.app/a2a");
    expect(card.preferredTransport).toBe("JSONRPC");
    expect(card.supportedInterfaces.map((item) => item.protocolBinding)).toEqual(["JSONRPC", "HTTP+JSON"]);
    expect(card.additionalInterfaces).toEqual([
      { url: "https://api.bazaarlens.app/a2a", transport: "JSONRPC" },
      { url: "https://api.bazaarlens.app/v1", transport: "HTTP+JSON" },
    ]);
    expect(card.supportedInterfaces[0]).toMatchObject({
      url: "https://api.bazaarlens.app/a2a",
      protocolVersion: "0.3",
    });
    expect(card.supportedInterfaces[1]).toMatchObject({
      url: "https://api.bazaarlens.app/v1/message:send",
      protocolVersion: "0.3",
    });
    expect(JSON.stringify(card)).not.toContain("a-32-plus-character-a2a-agent-key");
    expect(card.capabilities).toMatchObject({ streaming: true, pushNotifications: false });
    expect(card.securitySchemes.bazaarlensA2aKey).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "x-bazaarlens-a2a-key",
    });
    expect(card.security).toEqual([{ bazaarlensA2aKey: [] }]);
    expect(card.metadata).toMatchObject({
      modelProvider: "google-vertex",
      model: "gemini-3.5-flash",
      googleAgentPlatform: "Gemini Enterprise custom A2A registration",
      a2aProtocolVersion: "0.3",
      memoryProvider: null,
      evidenceProviders: [],
    });
    expect(card.skills[0]?.tags).toContain("mcp");
    expect(card.skills[0]?.tags).not.toContain("mongodb-mcp");
    expect(card.skills[0]?.security).toEqual([{ bazaarlensA2aKey: [] }]);
  });

  it("publishes configured memory and evidence providers in the agent card", () => {
    process.env = env({
      AGENT_MEMORY_ENABLED: "true",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb://localhost:27017/bazaarlens_agent",
      AGENT_EVIDENCE_PROVIDERS: "arize,elastic",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-secret",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-secret",
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    });

    const card = new A2aService(fakePrisma(), fakeAgent()).agentCard();

    expect(card.description).toContain("Arize Phoenix, Elastic context");
    expect(card.metadata).toMatchObject({
      memoryProvider: "MongoDB",
      evidenceProviders: ["arize", "elastic"],
    });
    expect(card.skills[0]?.description).toContain("MongoDB buying memory");
    expect(card.skills[0]?.description).toContain("Arize Phoenix, Elastic connected evidence");
    expect(card.skills[0]?.tags).toEqual(
      expect.arrayContaining(["mongodb-memory", "arize-evidence", "elastic-evidence"]),
    );
    expect(JSON.stringify(card)).not.toContain("phoenix-secret");
    expect(JSON.stringify(card)).not.toContain("elastic-secret");
  });

  it("publishes a non-secret submission profile for judges and platform setup", () => {
    process.env = env({
      HACKATHON_TRACK: "mongodb",
      AGENT_MEMORY_ENABLED: "true",
      AGENT_MEMORY_MCP_HTTP_URL: "http://mongodb-mcp:3000/mcp",
      MONGODB_MEMORY_CONNECTION_STRING: "mongodb://user:secret@localhost:27017/bazaarlens_agent",
      AGENT_EVIDENCE_PROVIDERS: "arize,elastic",
      ARIZE_MCP_ENABLED: "true",
      PHOENIX_HOST: "https://phoenix.example",
      PHOENIX_API_KEY: "phoenix-secret",
      ELASTIC_MCP_ENABLED: "true",
      ELASTIC_KIBANA_URL: "https://elastic.example",
      ELASTIC_API_KEY: "elastic-secret",
      ELASTIC_PRODUCT_INDEX: "bazaarlens-products",
    });

    const profile = new A2aService(fakePrisma(), fakeAgent()).submissionProfile();

    expect(profile).toMatchObject({
      name: "BazaarLens",
      selectedTrack: "mongodb",
      submission: {
        hostedProjectUrl: "https://bazaarlens.app",
        sourceCodeUrl: "https://github.com/aryan877/bazaarlens",
        repositoryVisibility: "private_until_devpost_submission",
        openSourceLicense: "MIT",
        licenseFile: "LICENSE",
        demoVideoUrl: null,
        requiredArtifacts: {
          hostedProject: "https://bazaarlens.app",
          sourceCodeRepository: "https://github.com/aryan877/bazaarlens",
          licenseFile: "LICENSE",
          demoVideo: "provided_on_devpost_submission",
        },
      },
      agentPlatform: {
        a2aProtocolVersion: "0.3",
        googleRegistrationMode: "Gemini Enterprise custom A2A agent",
        googleCloudAgentBuilder: {
          supported: true,
          importMode: "custom_a2a_agent",
          primaryImportUrl: "https://api.bazaarlens.app/.well-known/agent.json",
          openApiToolSchemaUrl: "https://api.bazaarlens.app/openapi.json",
          authHeader: "x-bazaarlens-a2a-key",
        },
        agentCardUrl: "https://api.bazaarlens.app/.well-known/agent.json",
        agentCardCompatibilityUrl: "https://api.bazaarlens.app/.well-known/agent-card.json",
        openApiUrl: "https://api.bazaarlens.app/openapi.json",
        a2aJsonRpcUrl: "https://api.bazaarlens.app/a2a",
        a2aHttpJsonUrl: "https://api.bazaarlens.app/v1/message:send",
        a2aHttpJsonStreamUrl: "https://api.bazaarlens.app/v1/message:stream",
        a2aHttpJsonCompatibilityUrl: "https://api.bazaarlens.app/a2a/message:send",
        a2aHttpJsonStreamCompatibilityUrl: "https://api.bazaarlens.app/a2a/message:stream",
        a2aTaskLookupUrlTemplate: "https://api.bazaarlens.app/v1/tasks/{taskId}",
        a2aTaskCancelUrlTemplate: "https://api.bazaarlens.app/v1/tasks/{taskId}:cancel",
      },
      model: {
        provider: "google-vertex",
        model: "gemini-3.5-flash",
      },
      memory: {
        provider: "MongoDB",
        configured: true,
      },
      evidenceProviders: ["arize", "elastic"],
    });
    expect(profile.selectedPartnerMcp).toMatchObject({
      provider: "mongodb",
      label: "MongoDB",
      enabled: true,
      configured: true,
      runtimePath: "agent-memory",
      mcpServer: {
        implementation: "Official MongoDB MCP Server",
        sourceUrl: "https://github.com/mongodb-js/mongodb-mcp-server",
        launch: "docker run --rm -i -e MDB_MCP_CONNECTION_STRING -e MDB_MCP_TRANSPORT=http -e MDB_MCP_HTTP_HOST=0.0.0.0 mongodb/mongodb-mcp-server:1.11.0",
      },
      qualificationEvidence: expect.arrayContaining([expect.stringContaining("Writes the new buying decision")]),
    });
    expect(profile.selectedTrackReadiness).toMatchObject({
      provider: "mongodb",
      label: "MongoDB",
      enabled: true,
      configured: true,
      qualified: true,
      runtimePath: "agent-memory",
      mcpServer: expect.objectContaining({
        implementation: "Official MongoDB MCP Server",
      }),
    });
    expect(profile.qualification).toMatchObject({
      poweredByGemini: true,
      googleAgentPlatformSurface: true,
      partnerMcpIntegrated: true,
      multiStepAgentFlow: true,
      humanOversight: true,
    });
    expect(profile.connectors.find((connector) => connector.provider === "mongodb")).toMatchObject({
      label: "MongoDB",
      enabled: true,
      configured: true,
      runtimePath: "agent-memory",
      mcpServer: expect.objectContaining({
        implementation: "Official MongoDB MCP Server",
      }),
    });
    expect(profile.connectors.find((connector) => connector.provider === "elastic")).toMatchObject({
      label: "Elastic",
      enabled: true,
      configured: true,
      runtimePath: "agent-evidence",
      mcpServer: expect.objectContaining({
        implementation: "Elastic Agent Builder MCP or Elasticsearch MCP Server",
      }),
    });
    expect(JSON.stringify(profile)).not.toContain("secret");
    expect(JSON.stringify(profile)).not.toContain("mongodb://");
    expect(JSON.stringify(profile)).not.toContain("phoenix.example");
    expect(JSON.stringify(profile)).not.toContain("elastic.example");
  });

  it("runs a product check when the message contains an AnalyzeRequest data part", async () => {
    process.env = env();
    const analyze = vi.fn(async () => ({
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
      memoryContext: {
        enabled: true,
        backend: "mongodb",
        provider: "MongoDB MCP Server",
        status: "available",
        tools: ["find", "insert-many"],
        similarProducts: [],
        notes: ["MongoDB MCP memory is connected."],
      },
      evidenceContext: {
        provider: "arize",
        label: "Arize Phoenix",
        purpose: "Agent trace, span, session, prompt, and evaluation evidence.",
        status: "available",
        transport: "stdio",
        tools: ["list-projects"],
        notes: ["Arize Phoenix MCP is reachable."],
        generatedAt: "2026-06-09T10:00:00.000Z",
      },
      evidenceContexts: [
        {
          provider: "arize",
          label: "Arize Phoenix",
          purpose: "Agent trace, span, session, prompt, and evaluation evidence.",
          status: "available",
          transport: "stdio",
          tools: ["list-projects"],
          notes: ["Arize Phoenix MCP is reachable."],
          generatedAt: "2026-06-09T10:00:00.000Z",
        },
        {
          provider: "elastic",
          label: "Elastic",
          purpose: "Search indexed product, price, and deal evidence during buying checks.",
          status: "available",
          transport: "http",
          tools: ["search"],
          notes: ["Elastic returned 2 indexed product/deal result(s)."],
          generatedAt: "2026-06-09T10:00:01.000Z",
        },
      ],
    }));
    const prisma = fakePrisma();

    const result = await new A2aService(prisma, fakeAgent(analyze)).sendMessage({
      message: {
        role: "ROLE_USER",
        messageId: "msg-1",
        parts: [{ data: analyzeRequest(), mediaType: "application/json" }],
      },
    });

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: "a2a-agent@bazaarlens.app" },
      update: {},
      create: {
        email: "a2a-agent@bazaarlens.app",
        name: "BazaarLens A2A Agent",
      },
      select: { id: true },
    });
    expect(analyze).toHaveBeenCalledOnce();
    expect(result.task.status.state).toBe("completed");
    expect(result.task.id).toBe("4a44b220-a577-4502-bc7d-ab789f90429d");
    expect(result.task.contextId).toBe("4a44b220-a577-4502-bc7d-ab789f90429d");
    expect(result.task.kind).toBe("task");
    expect(result.task.status.message).toMatchObject({
      kind: "message",
      role: "agent",
      parts: [{ kind: "text" }],
    });
    const completedTask = result.task as { artifacts?: Array<{ parts: unknown[] }> };
    expect(completedTask.artifacts?.[0]?.parts[0]).toMatchObject({
      kind: "data",
      data: {
        sessionId: "4a44b220-a577-4502-bc7d-ab789f90429d",
        decision: { verdict: "buy" },
      },
      mediaType: "application/json",
    });
    expect(result.task.metadata).toMatchObject({
      verdict: "buy",
      actionType: "wishlist",
      memoryStatus: "available",
      evidenceProvider: "arize",
      evidenceStatus: "available",
      evidenceProviders: ["arize", "elastic"],
    });
  });

  it("returns persisted A2A tasks and marks cancel as already terminal", async () => {
    process.env = env();
    const session = persistedSession();
    const service = new A2aService(fakePrisma(session), fakeAgent());

    const task = await service.getTask(session.id, 1);
    const cancelled = await service.cancelTask(session.id);

    expect(task).toMatchObject({
      id: session.id,
      contextId: session.id,
      kind: "task",
      status: {
        state: "completed",
      },
      metadata: {
        bazaarlensSessionId: session.id,
        verdict: "buy",
        actionType: "wishlist",
      },
    });
    expect(cancelled).toMatchObject({
      id: session.id,
      metadata: {
        cancelResult: "already_terminal",
      },
    });
    expect((task as { artifacts?: Array<{ parts: Array<{ data?: unknown }> }> }).artifacts?.[0]?.parts[0]?.data).toMatchObject({
      sessionId: session.id,
      page: {
        merchant: "amazon",
        title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
      },
    });
  });

  it("asks for structured product-page facts instead of guessing from plain text", async () => {
    process.env = env();
    const analyze = vi.fn();

    const result = await new A2aService(fakePrisma(), fakeAgent(analyze)).sendMessage({
      message: {
        role: "ROLE_USER",
        messageId: "msg-1",
        parts: [{ text: "Should I buy this?", mediaType: "text/plain" }],
      },
    });

    expect(analyze).not.toHaveBeenCalled();
    expect(result.task.status.state).toBe("input-required");
    expect(result.task.metadata).toMatchObject({
      reason: "missing_product_page_payload",
    });
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
  } as unknown as PrismaService;
}

function fakeAgent(analyze = vi.fn()) {
  return { analyze } as unknown as AgentService;
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

function persistedSession() {
  return {
    id: "4a44b220-a577-4502-bc7d-ab789f90429d",
    createdAt: new Date("2026-06-09T10:00:00.000Z"),
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
