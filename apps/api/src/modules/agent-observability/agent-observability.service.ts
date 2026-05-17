import { Injectable, OnModuleDestroy } from "@nestjs/common";
import {
  context,
  OpenInferenceSpanKind,
  register,
  SemanticConventions,
  setMetadata,
  setTags,
  setUser,
  SpanStatusCode,
  trace,
  type NodeTracerProvider,
  type Tracer,
} from "@arizeai/phoenix-otel";
import type { AgentDecision, AgentEvidenceContext, AgentMemoryContext, AnalyzeRequest } from "@bazaarlens/shared";
import { getEnv, type Env } from "../../shared/env.js";

type AttributeValue = string | number | boolean;
type Attributes = Record<string, AttributeValue | null | undefined>;

export interface TraceSpan {
  setAttribute(name: string, value: AttributeValue): void;
  setAttributes(attributes: Record<string, AttributeValue>): void;
  addEvent(name: string, attributes?: Record<string, AttributeValue>): void;
}

interface SpanOptions {
  readonly name: string;
  readonly kind: OpenInferenceSpanKind;
  readonly attributes?: Attributes;
}

@Injectable()
export class AgentObservabilityService implements OnModuleDestroy {
  private readonly env = getEnv();
  private provider: NodeTracerProvider | null = null;
  private tracer: Tracer = trace.getTracer("bazaarlens-api", "0.1.0");

  async onModuleDestroy(): Promise<void> {
    await this.provider?.shutdown().catch(() => undefined);
    this.provider = null;
  }

  get enabled(): boolean {
    return this.env.PHOENIX_TRACING_ENABLED;
  }

  async traceAnalysis<T>(userId: string, input: AnalyzeRequest, work: (span: TraceSpan | null) => Promise<T>): Promise<T> {
    if (!this.enabled) return work(null);

    const activeContext = setTags(
      setMetadata(setUser(context.active(), { userId }), {
        provider: "arize-phoenix",
        merchant: input.page.merchant,
        host: safeHost(input.page.url),
        hasPrice: Boolean(input.page.price),
        hasRating: Boolean(input.page.rating),
        agentMemoryEnabled: this.env.AGENT_MEMORY_ENABLED,
        aiProvider: "google-vertex",
        aiModel: this.env.GOOGLE_VERTEX_MODEL,
      }),
      ["bazaarlens", "shopping-agent", input.page.merchant],
    );

    return context.with(activeContext, () =>
      this.span(
        {
          name: "bazaarlens.agent.analyze",
          kind: OpenInferenceSpanKind.AGENT,
          attributes: {
            "bazaarlens.merchant": input.page.merchant,
            "bazaarlens.product.host": safeHost(input.page.url),
            "bazaarlens.product.title": truncate(input.page.title, 160),
            "bazaarlens.intent.has_budget": Boolean(input.intent.budget),
            "llm.provider": "google-vertex",
            "llm.model_name": this.env.GOOGLE_VERTEX_MODEL,
          },
        },
        work,
      ),
    );
  }

  async traceTool<T>(name: string, attributes: Attributes, work: (span: TraceSpan | null) => Promise<T>): Promise<T> {
    return this.span({ name, kind: OpenInferenceSpanKind.TOOL, attributes }, work);
  }

  async traceLlm<T>(name: string, attributes: Attributes, work: (span: TraceSpan | null) => Promise<T>): Promise<T> {
    return this.span({ name, kind: OpenInferenceSpanKind.LLM, attributes }, work);
  }

  markDecision(
    span: TraceSpan | null,
    decision: AgentDecision,
    memoryContext: AgentMemoryContext | undefined,
    evidenceContext?: AgentEvidenceContext,
    evidenceContexts: AgentEvidenceContext[] = evidenceContext ? [evidenceContext] : [],
  ): void {
    if (!span) return;
    const evidenceProviders = evidenceContexts.map((context) => context.provider);
    span.setAttributes(
      definedAttributes({
        "bazaarlens.verdict": decision.verdict,
        "bazaarlens.confidence": decision.confidence,
        "bazaarlens.action_type": decision.action.type,
        "bazaarlens.action_requires_approval": decision.action.requiresApproval,
        "bazaarlens.memory.status": memoryContext?.status,
        "bazaarlens.memory.provider": memoryContext?.provider,
        "bazaarlens.evidence.status": evidenceContext?.status,
        "bazaarlens.evidence.provider": evidenceContext?.provider,
        "bazaarlens.evidence.count": evidenceContexts.length,
        "bazaarlens.evidence.providers": evidenceProviders.join(","),
        "output.value": JSON.stringify({
          verdict: decision.verdict,
          confidence: decision.confidence,
          action: decision.action.type,
          requiresApproval: decision.action.requiresApproval,
        }),
      }),
    );
    span.addEvent("bazaarlens.decision", {
      verdict: decision.verdict,
      confidence: decision.confidence,
      actionType: decision.action.type,
      memoryStatus: memoryContext?.status ?? "none",
      evidenceStatus: evidenceContext?.status ?? "none",
      evidenceProviders: evidenceProviders.join(",") || "none",
    });
  }

  markSession(span: TraceSpan | null, sessionId: string): void {
    span?.setAttribute("session.id", sessionId);
  }

  private async span<T>(options: SpanOptions, work: (span: TraceSpan | null) => Promise<T>): Promise<T> {
    if (!this.enabled) return work(null);
    this.ensureProvider();

    return this.tracer.startActiveSpan(options.name, async (span) => {
      const started = Date.now();
      span.setAttribute(SemanticConventions.OPENINFERENCE_SPAN_KIND, options.kind);
      span.setAttributes(definedAttributes(options.attributes ?? {}));

      try {
        const result = await work(span);
        span.setAttribute("bazaarlens.duration_ms", Date.now() - started);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setAttribute("bazaarlens.duration_ms", Date.now() - started);
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: truncate(error.message, 180) });
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR, message: "Unknown error" });
        }
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private ensureProvider(): void {
    if (this.provider) return;

    this.provider = register({
      projectName: this.env.PHOENIX_PROJECT || "bazaarlens",
      url: this.env.PHOENIX_COLLECTOR_ENDPOINT || this.env.PHOENIX_HOST || undefined,
      apiKey: this.env.PHOENIX_API_KEY || undefined,
      batch: this.env.NODE_ENV !== "test",
      global: true,
    });
    this.tracer = trace.getTracer("bazaarlens-api", "0.1.0");
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function definedAttributes(attributes: Attributes): Record<string, AttributeValue> {
  return Object.fromEntries(
    Object.entries(attributes).filter((entry): entry is [string, AttributeValue] => {
      const value = entry[1];
      return value !== null && value !== undefined;
    }),
  );
}

function truncate(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}
