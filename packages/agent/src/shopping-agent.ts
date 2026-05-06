import {
  AgentActionTypeSchema,
  AgentDecisionSchema,
  AnalyzeRequestSchema,
  type AgentDecision,
  type AnalyzeRequest,
} from "@bazaarlens/shared";
import { createVertex } from "@ai-sdk/google-vertex";
import { generateObject } from "ai";
import { z } from "zod";

export interface ShoppingAgentOptions {
  readonly vertexApiKey?: string;
  readonly vertexProject?: string;
  readonly vertexLocation?: string;
  readonly model?: string;
  readonly fetcher?: typeof fetch;
}

export interface ResolvedVertexConfig {
  readonly apiKey?: string;
  readonly project?: string;
  readonly location: string;
  readonly model: string;
}

const DEFAULT_VERTEX_MODEL = "gemini-3.5-flash";
const MAX_OUTPUT_TOKENS = 4096;

const ModelActionSchema = z.object({
  type: AgentActionTypeSchema.catch("none"),
  label: z.string().catch("No browser action"),
  requiresApproval: z.boolean().catch(false),
  payload: z.record(z.string(), z.unknown()).catch({}),
});

const ModelDecisionSchema = z.object({
  verdict: AgentDecisionSchema.shape.verdict.catch("unknown"),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  summary: z.string().catch("I reviewed the visible product page signals."),
  reasons: z.array(z.string()).catch(["Visible product page signals were reviewed."]),
  risks: z.array(z.string()).catch([]),
  checks: z.array(z.string()).catch([]),
  action: ModelActionSchema.catch({
    type: "none",
    label: "No browser action",
    requiresApproval: false,
    payload: {},
  }),
  model: z.string().optional(),
});

export class ShoppingAgent {
  private readonly apiKey?: string;
  private readonly vertexProject?: string;
  private readonly vertexLocation?: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ShoppingAgentOptions = {}) {
    const config = resolveVertexConfig(options);
    this.apiKey = config.apiKey;
    this.vertexProject = config.project;
    this.vertexLocation = config.location;
    this.model = config.model;
    this.fetcher = options.fetcher ?? fetch;
  }

  async analyze(rawInput: AnalyzeRequest): Promise<AgentDecision> {
    const input = AnalyzeRequestSchema.parse(rawInput);
    if (!this.hasProviderCredentials()) {
      throw new Error("GOOGLE_VERTEX_API_KEY, GOOGLE_VERTEX_PROJECT, or GOOGLE_CLOUD_PROJECT is required");
    }

    const model = this.createLanguageModel();

    const result = await generateObject({
      model,
      system: SYSTEM_PROMPT,
      prompt: `${JSON.stringify(input)}\nReturn compact JSON only. No markdown fences. Use at most 3 reasons, 3 risks, and 3 checks.`,
      schema: ModelDecisionSchema,
      schemaName: "AgentDecision",
      schemaDescription: "A concise ecommerce buying decision and browser action plan.",
      temperature: 0.1,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      experimental_repairText: async ({ text }) => {
        try {
          return JSON.stringify(extractJson(text));
        } catch {
          return text;
        }
      },
    });

    return normalizeDecision(result.object, this.model);
  }

  private createLanguageModel() {
    return createVertex({
      apiKey: this.apiKey,
      project: this.vertexProject || undefined,
      location: this.vertexLocation,
      fetch: this.fetcher,
    })(this.model);
  }

  private hasProviderCredentials(): boolean {
    return Boolean(this.apiKey || this.vertexProject);
  }
}

export function resolveVertexConfig(options: ShoppingAgentOptions = {}): ResolvedVertexConfig {
  return {
    apiKey: firstNonEmpty(options.vertexApiKey, process.env.GOOGLE_VERTEX_API_KEY),
    project: firstNonEmpty(options.vertexProject, process.env.GOOGLE_VERTEX_PROJECT, process.env.GOOGLE_CLOUD_PROJECT),
    location: firstNonEmpty(options.vertexLocation, process.env.GOOGLE_VERTEX_LOCATION) ?? "global",
    model: firstNonEmpty(options.model, process.env.GOOGLE_VERTEX_MODEL) ?? DEFAULT_VERTEX_MODEL,
  };
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return JSON.parse(trimmed);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1]);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("Model did not return JSON");
}

function normalizeDecision(raw: z.infer<typeof ModelDecisionSchema>, model: string): AgentDecision {
  const actionType = raw.action.type;
  return AgentDecisionSchema.parse({
    verdict: raw.verdict,
    confidence: raw.confidence,
    summary: truncate(raw.summary, 700),
    reasons: normalizeList(raw.reasons, 6, 220, ["Visible product page signals support this recommendation."]),
    risks: normalizeList(raw.risks, 6, 220),
    checks: normalizeList(raw.checks, 6, 220),
    action: {
      type: actionType,
      label: truncate(raw.action.label || defaultActionLabel(actionType), 120),
      requiresApproval: actionType === "add_to_cart" || actionType === "wishlist" ? true : raw.action.requiresApproval,
      payload: raw.action.payload ?? {},
    },
    model,
  });
}

function normalizeList(values: string[], maxItems: number, maxLength: number, fallback: string[] = []): string[] {
  const cleaned = values.map((value) => truncate(value, maxLength)).filter(Boolean);
  const list = cleaned.length ? cleaned : fallback;
  return list.slice(0, maxItems);
}

function truncate(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function defaultActionLabel(type: z.infer<typeof AgentActionTypeSchema>): string {
  if (type === "add_to_cart") return "Add to cart";
  if (type === "wishlist") return "Save to wishlist";
  if (type === "open_comparison") return "Open comparison";
  if (type === "ask_clarification") return "Ask a follow-up";
  return "No browser action";
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value));
}

const SYSTEM_PROMPT = `You are BazaarLens, an Indian ecommerce buying copilot embedded in a Chrome side panel.

Return only one strict, complete JSON object matching this TypeScript shape. Do not write markdown fences, prefaces, comments, or reasoning:
{
  "verdict": "buy" | "wait" | "avoid" | "compare" | "unknown",
  "confidence": number,
  "summary": string,
  "reasons": string[],
  "risks": string[],
  "checks": string[],
  "action": {
    "type": "none" | "add_to_cart" | "wishlist" | "open_comparison" | "ask_clarification",
    "label": string,
    "requiresApproval": boolean,
    "payload": Record<string, unknown>
  },
  "model": "placeholder"
}

Rules:
- Use visible page evidence plus explicitly supplied agent memory or connected-system context only. Do not invent prices, sellers, warranties, review counts, or policies.
- Optimize for realistic Indian shoppers: price history uncertainty, seller trust, return windows, warranty, delivery, size/variant mismatch, fake discount risk, and payment safety.
- Never approve checkout, payment, OTP, address changes, or credential entry.
- Only propose add_to_cart or wishlist when the visible signals are strong enough and set requiresApproval=true.
- If the user asks for alternatives but the page data has no alternative products, use open_comparison and explain what to compare next.
- Keep copy concise enough for a Chrome side panel: summary under 55 words, max 3 reasons, max 3 risks, max 3 checks, and every list item under 150 characters.`;
