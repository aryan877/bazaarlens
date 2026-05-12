import { BadRequestException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentActionSchema, type AgentAction } from "@bazaarlens/shared";
import { AgentService } from "./agent.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { AgentEvidenceService } from "../agent-evidence/agent-evidence.service.js";
import type { AgentMemoryService } from "../agent-memory/agent-memory.service.js";
import type { AgentObservabilityService } from "../agent-observability/agent-observability.service.js";

const shoppingAnalyzeMock = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({
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
  })),
);

vi.mock("@bazaarlens/agent", () => ({
  ShoppingAgent: class {
    async analyze(input: unknown) {
      return shoppingAnalyzeMock(input);
    }
  },
}));

const originalEnv = { ...process.env };

describe("approval action schema", () => {
  it("requires approval for mutating browser actions in fixtures", () => {
    const action = AgentActionSchema.parse({
      type: "add_to_cart",
      label: "Add to cart",
      requiresApproval: true,
      payload: {},
    });
    expect(action.requiresApproval).toBe(true);
  });
});

describe("AgentService approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shoppingAnalyzeMock.mockClear();
    Object.assign(process.env, {
      NODE_ENV: "test",
      API_PORT: "8787",
      API_PUBLIC_URL: "http://localhost:8787",
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
      JWT_SECRET: "test-secret-with-enough-length",
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses the stored agent action, not an arbitrary client action, when approving", async () => {
    const storedAction = action("wishlist", "Save to wishlist", true, { source: "model" });
    const prisma = prismaForDecision(storedAction);
    const service = new AgentService(prisma as unknown as PrismaService);

    const result = await service.approve("user-1", {
      sessionId: "83f39080-30de-46b5-acb6-4933c7569e28",
      action: action("wishlist", "Save to wishlist", true, { source: "model" }),
      approved: true,
    });

    expect(result.command.command).toBe("click_wishlist");
    expect(prisma.approval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: storedAction,
        approved: true,
        command: expect.objectContaining({ command: "click_wishlist" }),
      }),
    });
  });

  it("rejects approvals when the client mutates the stored action", async () => {
    const prisma = prismaForDecision(action("wishlist", "Save to wishlist", true));
    const service = new AgentService(prisma as unknown as PrismaService);

    await expect(
      service.approve("user-1", {
        sessionId: "83f39080-30de-46b5-acb6-4933c7569e28",
        action: action("add_to_cart", "Add to cart", true),
        approved: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.approval.create).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("refuses mutating stored actions that are missing an approval requirement", async () => {
    const unsafeAction = action("add_to_cart", "Add to cart", false);
    const prisma = prismaForDecision(unsafeAction);
    const service = new AgentService(prisma as unknown as PrismaService);

    await expect(
      service.approve("user-1", {
        sessionId: "83f39080-30de-46b5-acb6-4933c7569e28",
        action: unsafeAction,
        approved: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.approval.create).not.toHaveBeenCalled();
  });

  it("reads and writes agent memory around analysis", async () => {
    const prisma = {
      productSnapshot: {
        create: vi.fn(async () => ({ id: "snapshot-1" })),
      },
      agentSession: {
        create: vi.fn(async () => ({ id: "83f39080-30de-46b5-acb6-4933c7569e28" })),
      },
      auditEvent: {
        create: vi.fn(async () => ({})),
      },
    };
    const agentMemory = {
      buyingContext: vi.fn(async () => ({
        enabled: true,
        backend: "mongodb",
        provider: "MongoDB MCP Server",
        status: "available",
        tools: ["find", "insert-many"],
        similarProducts: [],
        notes: ["MongoDB MCP memory is connected; no prior comparable checks were found."],
      })),
      recordAnalysis: vi.fn(async () => undefined),
    };
    const observability = {
      traceAnalysis: vi.fn(async (_userId, _input, work) =>
        work({
          setAttribute: vi.fn(),
          setAttributes: vi.fn(),
          addEvent: vi.fn(),
        }),
      ),
      traceTool: vi.fn(async (_name, _attributes, work) => work(null)),
      traceLlm: vi.fn(async (_name, _attributes, work) => work(null)),
      markDecision: vi.fn(),
      markSession: vi.fn(),
    };
    const agentEvidence = {
      contextsForAnalysis: vi.fn(async () => [
        {
          provider: "arize",
          label: "Arize Phoenix",
          purpose: "Agent trace, span, session, prompt, and evaluation evidence.",
          status: "available",
          transport: "stdio",
          tools: ["list-projects", "list-traces"],
          notes: ["Arize Phoenix MCP is reachable for this amazon product check."],
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
      ]),
    };
    const service = new AgentService(
      prisma as unknown as PrismaService,
      agentMemory as unknown as AgentMemoryService,
      observability as unknown as AgentObservabilityService,
      agentEvidence as unknown as AgentEvidenceService,
    );

    const result = await service.analyze("user-1", {
      page: {
        url: "https://www.amazon.in/example/dp/B000000",
        merchant: "amazon",
        title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
        price: { amount: 1299, currency: "INR", raw: "₹1,299" },
        mrp: null,
        discountText: null,
        rating: 4,
        reviewCount: 1000,
        seller: "Appario Retail Private Ltd",
        availability: "In stock",
        delivery: "Tomorrow",
        returnPolicy: "7 day replacement",
        selectedSize: null,
        images: [],
        breadcrumbs: ["Electronics"],
        visibleText: "boAt earbuds price rating seller",
        extractedAt: new Date().toISOString(),
      },
      intent: {
        query: "Should I buy this under ₹1,500?",
        budget: 1500,
        userContext: null,
      },
    });

    expect(result.memoryContext?.provider).toBe("MongoDB MCP Server");
    expect(result.evidenceContext?.provider).toBe("arize");
    expect(result.evidenceContexts?.map((context) => context.provider)).toEqual(["arize", "elastic"]);
    expect(agentMemory.buyingContext).toHaveBeenCalledWith("user-1", expect.objectContaining({ page: expect.objectContaining({ merchant: "amazon" }) }));
    expect(agentEvidence.contextsForAnalysis).toHaveBeenCalledWith(expect.objectContaining({ page: expect.objectContaining({ merchant: "amazon" }) }));
    expect(shoppingAnalyzeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          userContext: expect.stringContaining("Agent memory: MongoDB MCP memory is connected"),
        }),
      }),
    );
    expect(shoppingAnalyzeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          userContext: expect.stringContaining("Connected evidence (Arize Phoenix): Arize Phoenix MCP is reachable"),
        }),
      }),
    );
    expect(shoppingAnalyzeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: expect.objectContaining({
          userContext: expect.stringContaining("Connected evidence (Elastic): Elastic returned 2 indexed product/deal result"),
        }),
      }),
    );
    expect(agentMemory.recordAnalysis).toHaveBeenCalledWith(
      "user-1",
      "83f39080-30de-46b5-acb6-4933c7569e28",
      expect.any(Object),
      expect.objectContaining({ model: "gemini-3.5-flash" }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          agentMemory: expect.objectContaining({ backend: "mongodb", status: "available" }),
          agentEvidence: expect.objectContaining({ provider: "arize", status: "available" }),
          agentEvidenceProviders: [
            expect.objectContaining({ provider: "arize", status: "available" }),
            expect.objectContaining({ provider: "elastic", status: "available" }),
          ],
        }),
      }),
    });
    expect(observability.traceAnalysis).toHaveBeenCalledOnce();
    expect(observability.traceLlm).toHaveBeenCalledWith(
      "bazaarlens.agent.decision",
      expect.objectContaining({
        "bazaarlens.merchant": "amazon",
        "bazaarlens.evidence.provider": "arize",
        "bazaarlens.evidence.count": 2,
        "bazaarlens.evidence.providers": "arize,elastic",
      }),
      expect.any(Function),
    );
    expect(observability.markDecision).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ verdict: expect.any(String) }),
      expect.objectContaining({ provider: "MongoDB MCP Server" }),
      expect.objectContaining({ provider: "arize" }),
      [
        expect.objectContaining({ provider: "arize" }),
        expect.objectContaining({ provider: "elastic" }),
      ],
    );
    expect(observability.markSession).toHaveBeenCalledWith(expect.any(Object), "83f39080-30de-46b5-acb6-4933c7569e28");
  });
});

function prismaForDecision(storedAction: AgentAction) {
  return {
    agentSession: {
      findFirst: vi.fn(async () => ({
        id: "83f39080-30de-46b5-acb6-4933c7569e28",
        decision: {
          verdict: "buy",
          confidence: 0.82,
          summary: "Good visible product signals.",
          reasons: ["Trusted seller and good price."],
          risks: [],
          checks: [],
          action: storedAction,
          model: "google/gemini-3.5-flash",
        },
        productSnapshot: {
          url: "https://www.amazon.in/example/dp/B000000",
          title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
        },
      })),
    },
    approval: {
      create: vi.fn(async () => ({})),
    },
    auditEvent: {
      create: vi.fn(async () => ({})),
    },
  };
}

function action(type: AgentAction["type"], label: string, requiresApproval: boolean, payload = {}): AgentAction {
  return { type, label, requiresApproval, payload };
}
