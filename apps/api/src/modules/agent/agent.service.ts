import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ShoppingAgent } from "@bazaarlens/agent";
import {
  AgentDecisionSchema,
  AgentActionSchema,
  AnalyzeRequestSchema,
  type AgentAction,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type ApprovalRequest,
  type ApprovalResponse,
  type BrowserCommand,
  type HistoryItem,
  type AgentMemoryContext,
  type AgentEvidenceContext,
} from "@bazaarlens/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AgentEvidenceService } from "../agent-evidence/agent-evidence.service.js";
import { AgentMemoryService } from "../agent-memory/agent-memory.service.js";
import { AgentObservabilityService, type TraceSpan } from "../agent-observability/agent-observability.service.js";
import { getEnv } from "../../shared/env.js";
import { toPrismaJson } from "../../shared/json.js";

@Injectable()
export class AgentService {
  private readonly env = getEnv();
  private readonly agent = new ShoppingAgent({
    vertexApiKey: this.env.GOOGLE_VERTEX_API_KEY,
    vertexProject: this.env.GOOGLE_VERTEX_PROJECT,
    vertexLocation: this.env.GOOGLE_VERTEX_LOCATION,
    model: this.env.GOOGLE_VERTEX_MODEL,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentMemory?: AgentMemoryService,
    private readonly observability?: AgentObservabilityService,
    private readonly agentEvidence?: AgentEvidenceService,
  ) {}

  async analyze(userId: string, body: AnalyzeRequest): Promise<AnalyzeResponse> {
    const input = AnalyzeRequestSchema.parse(body);
    return this.traceAnalysis(userId, input, (analysisSpan) => this.runAnalyze(userId, input, analysisSpan));
  }

  private async runAnalyze(userId: string, input: AnalyzeRequest, analysisSpan: TraceSpan | null): Promise<AnalyzeResponse> {
    const memoryContext = await this.traceTool(
      "bazaarlens.memory.lookup",
      {
        "bazaarlens.memory.enabled": Boolean(this.agentMemory),
        "bazaarlens.merchant": input.page.merchant,
      },
      () => this.agentMemory?.buyingContext(userId, input) ?? Promise.resolve(undefined),
    );
    const evidenceContexts = await this.traceTool(
      "bazaarlens.evidence.lookup",
      {
        "bazaarlens.track": this.env.HACKATHON_TRACK,
        "bazaarlens.evidence.enabled": Boolean(this.agentEvidence),
        "bazaarlens.merchant": input.page.merchant,
      },
      () => this.agentEvidence?.contextsForAnalysis(input) ?? Promise.resolve([]),
    );
    const evidenceContext = evidenceContexts[0];
    const evidenceProviders = evidenceContexts.map((context) => context.provider);
    const enrichedInput = enrichWithAgentContext(input, memoryContext, evidenceContexts);
    const decision = await this.traceLlm(
      "bazaarlens.agent.decision",
      {
        "bazaarlens.merchant": input.page.merchant,
        "bazaarlens.memory.status": memoryContext?.status,
        "bazaarlens.evidence.status": evidenceContext?.status,
        "bazaarlens.evidence.provider": evidenceContext?.provider,
        "bazaarlens.evidence.count": evidenceContexts.length,
        "bazaarlens.evidence.providers": evidenceProviders.join(","),
        "llm.provider": "google-vertex",
        "llm.model_name": this.env.GOOGLE_VERTEX_MODEL,
      },
      () => this.agent.analyze(enrichedInput),
    );
    this.observability?.markDecision(analysisSpan, decision, memoryContext, evidenceContext, evidenceContexts);

    const snapshot = await this.traceTool("bazaarlens.persistence.snapshot", { "bazaarlens.merchant": input.page.merchant }, () =>
      this.prisma.productSnapshot.create({
        data: {
          merchant: input.page.merchant,
          url: input.page.url,
          title: input.page.title,
          priceAmount: input.page.price?.amount ?? null,
          priceRaw: input.page.price?.raw ?? null,
          rating: input.page.rating,
          reviewCount: input.page.reviewCount,
          seller: input.page.seller,
          availability: input.page.availability,
          delivery: input.page.delivery,
          returnPolicy: input.page.returnPolicy,
          payload: toPrismaJson(input.page),
        },
      }),
    );

    const session = await this.traceTool("bazaarlens.persistence.session", { "bazaarlens.verdict": decision.verdict }, () =>
      this.prisma.agentSession.create({
        data: {
          userId,
          productSnapshotId: snapshot.id,
          intent: toPrismaJson(input.intent),
          decision: toPrismaJson(decision),
          verdict: decision.verdict,
          model: decision.model,
        },
      }),
    );
    this.observability?.markSession(analysisSpan, session.id);

    await this.traceTool(
      "bazaarlens.memory.record",
      {
        "bazaarlens.memory.enabled": Boolean(this.agentMemory),
        "bazaarlens.verdict": decision.verdict,
      },
      () => this.agentMemory?.recordAnalysis(userId, session.id, input, decision) ?? Promise.resolve(undefined),
    );

    await this.traceTool("bazaarlens.persistence.audit", { "bazaarlens.audit.type": "agent.analyze" }, () =>
      this.prisma.auditEvent.create({
        data: {
          userId,
          sessionId: session.id,
          type: "agent.analyze",
          payload: toPrismaJson({
            merchant: input.page.merchant,
            verdict: decision.verdict,
            model: decision.model,
            agentMemory: memoryContext
              ? { backend: memoryContext.backend, provider: memoryContext.provider, status: memoryContext.status }
              : null,
            agentEvidence: evidenceContext
              ? { provider: evidenceContext.provider, label: evidenceContext.label, status: evidenceContext.status }
              : null,
            agentEvidenceProviders: evidenceContexts.map((context) => ({
              provider: context.provider,
              label: context.label,
              status: context.status,
            })),
          }),
        },
      }),
    );

    return {
      sessionId: session.id,
      decision,
      memoryContext,
      evidenceContext,
      evidenceContexts: evidenceContexts.length ? evidenceContexts : undefined,
    };
  }

  async approve(userId: string, input: ApprovalRequest): Promise<ApprovalResponse> {
    return this.traceTool(
      "bazaarlens.approval.resolve",
      {
        "session.id": input.sessionId,
        "bazaarlens.approval.approved": input.approved,
        "bazaarlens.approval.action_type": input.action.type,
      },
      () => this.runApprove(userId, input),
    );
  }

  private async runApprove(userId: string, input: ApprovalRequest): Promise<ApprovalResponse> {
    const session = await this.prisma.agentSession.findFirst({
      where: { id: input.sessionId, userId },
      include: { productSnapshot: true },
    });
    if (!session) throw new NotFoundException("Agent session not found");

    const requestedAction = AgentActionSchema.parse(input.action);
    const storedDecision = AgentDecisionSchema.parse(session.decision);
    const action = storedDecision.action;
    if (!actionsMatch(requestedAction, action)) {
      throw new BadRequestException("Approval action does not match the stored agent decision");
    }
    if (input.approved && isMutatingAction(action) && !action.requiresApproval) {
      throw new BadRequestException("Stored mutating action is missing an approval requirement");
    }

    const command = input.approved ? commandForAction(action, session.productSnapshot.url, session.productSnapshot.title) : noopCommand("Action denied.");

    await this.prisma.approval.create({
      data: {
        sessionId: session.id,
        action: toPrismaJson(action),
        approved: input.approved,
        command: toPrismaJson(command),
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        userId,
        sessionId: session.id,
        type: input.approved ? "action.approved" : "action.denied",
        payload: toPrismaJson({ action: action.type, command: command.command }),
      },
    });

    return { ok: true, command };
  }

  async history(userId: string): Promise<HistoryItem[]> {
    const sessions = await this.prisma.agentSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        productSnapshot: true,
        approvals: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return sessions.map((session) => {
      const decision = session.decision as { summary?: string };
      return {
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        merchant: session.productSnapshot.merchant,
        title: session.productSnapshot.title,
        url: session.productSnapshot.url,
        verdict: session.verdict,
        summary: decision.summary ?? "No summary stored.",
        approvedAction: session.approvals[0]?.approved
          ? String((session.approvals[0].action as { type?: string }).type ?? "approved")
          : null,
      };
    });
  }

  private async traceAnalysis<T>(userId: string, input: AnalyzeRequest, work: (span: TraceSpan | null) => Promise<T>): Promise<T> {
    return this.observability ? this.observability.traceAnalysis(userId, input, work) : work(null);
  }

  private async traceTool<T>(name: string, attributes: Record<string, string | number | boolean | null | undefined>, work: (span: TraceSpan | null) => Promise<T>): Promise<T> {
    return this.observability ? this.observability.traceTool(name, attributes, work) : work(null);
  }

  private async traceLlm<T>(name: string, attributes: Record<string, string | number | boolean | null | undefined>, work: (span: TraceSpan | null) => Promise<T>): Promise<T> {
    return this.observability ? this.observability.traceLlm(name, attributes, work) : work(null);
  }
}

function commandForAction(action: AgentAction, url: string, title: string): BrowserCommand {
  switch (action.type) {
    case "add_to_cart":
      return {
        command: "click_add_to_cart",
        selector: null,
        url: null,
        message: "Approved. I will click the visible add-to-cart control.",
      };
    case "wishlist":
      return {
        command: "click_wishlist",
        selector: null,
        url: null,
        message: "Approved. I will click the visible wishlist control.",
      };
    case "open_comparison": {
      const search = new URL("https://www.google.com/search");
      search.searchParams.set("q", `${title} best price India`);
      return {
        command: "open_url",
        selector: null,
        url: search.toString(),
        message: "Opening a comparison search in a new tab.",
      };
    }
    default:
      return noopCommand(`No browser action is needed for ${url}.`);
  }
}

function noopCommand(message: string): BrowserCommand {
  return { command: "noop", selector: null, url: null, message };
}

function enrichWithAgentContext(
  input: AnalyzeRequest,
  memoryContext: AgentMemoryContext | undefined,
  evidenceContexts: AgentEvidenceContext[],
): AnalyzeRequest {
  const contextLines = [memoryContextLine(memoryContext), ...evidenceContexts.map(evidenceContextLine)].filter(Boolean);
  if (!contextLines.length) return input;

  return AnalyzeRequestSchema.parse({
    ...input,
    intent: {
      ...input.intent,
      userContext: truncateContext([input.intent.userContext, ...contextLines].filter(Boolean).join("\n")),
    },
  });
}

function memoryContextLine(context: AgentMemoryContext | undefined): string {
  if (!context || context.status !== "available") return "";
  const memoryLines = context.similarProducts.map((product) =>
    [
      product.merchant,
      product.title,
      product.priceRaw ? `price ${product.priceRaw}` : null,
      product.verdict ? `last verdict ${product.verdict}` : null,
      product.summary,
    ]
      .filter(Boolean)
      .join(" - "),
  );
  const memoryNote = memoryLines.length
    ? `Agent memory: ${memoryLines.join(" | ")}`
    : context.notes[0]
      ? `Agent memory: ${context.notes[0]}`
      : "";
  return memoryNote;
}

function evidenceContextLine(context: AgentEvidenceContext | undefined): string {
  if (!context || context.status !== "available") return "";
  const noteText = context.notes.slice(0, 4).join(" | ");
  if (!noteText) return "";
  return `Connected evidence (${context.label}): ${noteText}`;
}

function truncateContext(value: string): string {
  if (value.length <= 1000) return value;
  return value.slice(0, 997).trimEnd() + "...";
}

function actionsMatch(left: AgentAction, right: AgentAction): boolean {
  return (
    left.type === right.type &&
    left.label === right.label &&
    left.requiresApproval === right.requiresApproval &&
    stableStringify(left.payload ?? {}) === stableStringify(right.payload ?? {})
  );
}

function isMutatingAction(action: AgentAction): boolean {
  return action.type === "add_to_cart" || action.type === "wishlist";
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}
