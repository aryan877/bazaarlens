import { z } from "zod";

export const MerchantSchema = z.enum(["amazon", "flipkart", "myntra", "generic"]);
export type Merchant = z.infer<typeof MerchantSchema>;

export const ProductPriceSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.enum(["INR", "USD", "UNKNOWN"]).default("INR"),
  raw: z.string().min(1),
});
export type ProductPrice = z.infer<typeof ProductPriceSchema>;

export const ProductPageSchema = z.object({
  url: z.string().url(),
  merchant: MerchantSchema,
  title: z.string().min(1).max(400),
  price: ProductPriceSchema.nullable(),
  mrp: ProductPriceSchema.nullable().default(null),
  discountText: z.string().max(120).nullable().default(null),
  rating: z.number().min(0).max(5).nullable().default(null),
  reviewCount: z.number().int().nonnegative().nullable().default(null),
  seller: z.string().max(160).nullable().default(null),
  availability: z.string().max(160).nullable().default(null),
  delivery: z.string().max(240).nullable().default(null),
  returnPolicy: z.string().max(240).nullable().default(null),
  selectedSize: z.string().max(80).nullable().default(null),
  images: z.array(z.string().url()).max(12).default([]),
  breadcrumbs: z.array(z.string().min(1)).max(12).default([]),
  visibleText: z.string().max(12000).default(""),
  extractedAt: z.string().datetime(),
});
export type ProductPage = z.infer<typeof ProductPageSchema>;

export const ShoppingIntentSchema = z.object({
  query: z.string().max(1000).default("Should I buy this?"),
  budget: z.number().positive().nullable().default(null),
  userContext: z.string().max(1000).nullable().default(null),
});
export type ShoppingIntent = z.infer<typeof ShoppingIntentSchema>;

export const AnalyzeRequestSchema = z.object({
  page: ProductPageSchema,
  intent: ShoppingIntentSchema.default({
    query: "Should I buy this?",
    budget: null,
    userContext: null,
  }),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const AgentActionTypeSchema = z.enum([
  "none",
  "add_to_cart",
  "wishlist",
  "open_comparison",
  "ask_clarification",
]);
export type AgentActionType = z.infer<typeof AgentActionTypeSchema>;

export const AgentActionSchema = z.object({
  type: AgentActionTypeSchema,
  label: z.string().max(120),
  requiresApproval: z.boolean(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

export const AgentDecisionSchema = z.object({
  verdict: z.enum(["buy", "wait", "avoid", "compare", "unknown"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(700),
  reasons: z.array(z.string().min(1).max(220)).min(1).max(6),
  risks: z.array(z.string().min(1).max(220)).max(6).default([]),
  checks: z.array(z.string().min(1).max(220)).max(6).default([]),
  action: AgentActionSchema,
  model: z.string().min(1),
});
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

export const AgentMemoryProductMemorySchema = z.object({
  merchant: MerchantSchema,
  title: z.string().min(1).max(400),
  url: z.string().url(),
  priceRaw: z.string().nullable().default(null),
  verdict: AgentDecisionSchema.shape.verdict.nullable().default(null),
  summary: z.string().max(700).nullable().default(null),
  checkedAt: z.string().datetime().nullable().default(null),
});
export type AgentMemoryProductMemory = z.infer<typeof AgentMemoryProductMemorySchema>;

export const AgentMemoryContextSchema = z.object({
  enabled: z.boolean(),
  backend: z.literal("mongodb"),
  provider: z.string().min(1),
  status: z.enum(["available", "disabled", "unavailable", "error"]),
  tools: z.array(z.string().min(1)).max(20).default([]),
  similarProducts: z.array(AgentMemoryProductMemorySchema).max(5).default([]),
  notes: z.array(z.string().min(1).max(220)).max(5).default([]),
});
export type AgentMemoryContext = z.infer<typeof AgentMemoryContextSchema>;

export const McpProviderSchema = z.enum(["mongodb", "elastic", "arize", "fivetran", "gitlab", "dynatrace"]);
export type McpProvider = z.infer<typeof McpProviderSchema>;

export const McpCapabilitySchema = z.object({
  provider: McpProviderSchema,
  label: z.string().min(1).max(80),
  purpose: z.string().min(1).max(180),
  runtimePath: z.enum(["agent-memory", "agent-evidence"]),
  mcpServer: z.object({
    implementation: z.string().min(1).max(160),
    sourceUrl: z.string().url(),
    launch: z.string().min(1).max(220).optional(),
  }),
  qualificationEvidence: z.array(z.string().min(1).max(220)).max(5).default([]),
  status: z.enum(["available", "configured", "disabled", "missing_config", "error"]),
  transport: z.enum(["http", "stdio", "remote", "not_configured"]),
  tools: z.array(z.string().min(1)).max(20).default([]),
  notes: z.array(z.string().min(1).max(220)).max(4).default([]),
});
export type McpCapability = z.infer<typeof McpCapabilitySchema>;

export const McpCapabilitiesResponseSchema = z.object({
  checksEnabled: z.boolean(),
  generatedAt: z.string().datetime(),
  selectedTrack: McpProviderSchema,
  selectedConnector: McpCapabilitySchema.nullable(),
  selectedTrackQualified: z.boolean(),
  connectors: z.array(McpCapabilitySchema),
});
export type McpCapabilitiesResponse = z.infer<typeof McpCapabilitiesResponseSchema>;

export const AgentEvidenceContextSchema = McpCapabilitySchema.extend({
  notes: z.array(z.string().min(1).max(220)).max(5).default([]),
  generatedAt: z.string().datetime(),
});
export type AgentEvidenceContext = z.infer<typeof AgentEvidenceContextSchema>;

export const AnalyzeResponseSchema = z.object({
  sessionId: z.string().uuid(),
  decision: AgentDecisionSchema,
  memoryContext: AgentMemoryContextSchema.optional(),
  evidenceContext: AgentEvidenceContextSchema.optional(),
  evidenceContexts: z.array(AgentEvidenceContextSchema).max(5).optional(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const ApprovalRequestSchema = z.object({
  sessionId: z.string().uuid(),
  action: AgentActionSchema,
  approved: z.boolean(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const BrowserCommandSchema = z.object({
  command: z.enum(["noop", "click_add_to_cart", "click_wishlist", "open_url"]),
  selector: z.string().nullable().default(null),
  url: z.string().url().nullable().default(null),
  message: z.string(),
});
export type BrowserCommand = z.infer<typeof BrowserCommandSchema>;

export const ApprovalResponseSchema = z.object({
  ok: z.boolean(),
  command: BrowserCommandSchema,
});
export type ApprovalResponse = z.infer<typeof ApprovalResponseSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string().min(20),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
  }),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const ExtensionAuthStatusSchema = z.enum(["pending", "completed"]);
export type ExtensionAuthStatus = z.infer<typeof ExtensionAuthStatusSchema>;

const ExtensionUserCodeSchema = z.string().regex(/^\d{6}$/);

export const ExtensionAuthStartResponseSchema = z.object({
  flowId: z.string().uuid(),
  userCode: ExtensionUserCodeSchema,
  pollToken: z.string().min(32),
  expiresAt: z.string().datetime(),
  verificationUri: z.string().url(),
  verificationUriComplete: z.string().url(),
  intervalSeconds: z.number().int().min(2).max(30),
});
export type ExtensionAuthStartResponse = z.infer<typeof ExtensionAuthStartResponseSchema>;

export const ExtensionAuthDetailsResponseSchema = z.object({
  flowId: z.string().uuid(),
  userCode: ExtensionUserCodeSchema,
  expiresAt: z.string().datetime(),
  status: ExtensionAuthStatusSchema,
});
export type ExtensionAuthDetailsResponse = z.infer<typeof ExtensionAuthDetailsResponseSchema>;

export const ExtensionAuthPollResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("pending"),
    userCode: ExtensionUserCodeSchema,
    expiresAt: z.string().datetime(),
  }),
  z.object({
    status: z.literal("completed"),
    auth: AuthResponseSchema,
  }),
]);
export type ExtensionAuthPollResponse = z.infer<typeof ExtensionAuthPollResponseSchema>;

export const HistoryItemSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  merchant: MerchantSchema,
  title: z.string(),
  url: z.string().url(),
  verdict: AgentDecisionSchema.shape.verdict,
  summary: z.string(),
  approvedAction: z.string().nullable(),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;
