import type { OpenAPIObject } from "@nestjs/swagger";

type SchemaObject = NonNullable<NonNullable<OpenAPIObject["components"]>["schemas"]>[string];

const priceSchema: SchemaObject = {
  type: "object",
  required: ["amount", "currency", "raw"],
  properties: {
    amount: { type: "number", minimum: 0, example: 1299 },
    currency: { type: "string", enum: ["INR", "USD", "UNKNOWN"], example: "INR" },
    raw: { type: "string", minLength: 1, example: "Rs 1,299" },
  },
};

const productPageSchema: SchemaObject = {
  type: "object",
  required: ["url", "merchant", "title", "price", "extractedAt"],
  properties: {
    url: { type: "string", format: "uri", example: "https://www.amazon.in/example/dp/B000000001" },
    merchant: { type: "string", enum: ["amazon", "flipkart", "myntra", "generic"], example: "amazon" },
    title: { type: "string", minLength: 1, maxLength: 400, example: "boAt Airdopes 141 Bluetooth TWS Earbuds" },
    price: { ...priceSchema, nullable: true },
    mrp: { ...priceSchema, nullable: true },
    discountText: { type: "string", nullable: true, maxLength: 120, example: "58% off" },
    rating: { type: "number", nullable: true, minimum: 0, maximum: 5, example: 4 },
    reviewCount: { type: "integer", nullable: true, minimum: 0, example: 4200 },
    seller: { type: "string", nullable: true, maxLength: 160, example: "Appario Retail Private Ltd" },
    availability: { type: "string", nullable: true, maxLength: 160, example: "In stock" },
    delivery: { type: "string", nullable: true, maxLength: 240, example: "Tomorrow" },
    returnPolicy: { type: "string", nullable: true, maxLength: 240, example: "7 days replacement" },
    selectedSize: { type: "string", nullable: true, maxLength: 80 },
    images: { type: "array", maxItems: 12, items: { type: "string", format: "uri" } },
    breadcrumbs: { type: "array", maxItems: 12, items: { type: "string" }, example: ["Electronics", "Headphones"] },
    visibleText: { type: "string", maxLength: 12000, example: "Visible product-page text extracted from the active tab." },
    extractedAt: { type: "string", format: "date-time", example: "2026-06-09T10:00:00.000Z" },
  },
};

const intentSchema: SchemaObject = {
  type: "object",
  properties: {
    query: { type: "string", maxLength: 1000, example: "Should I buy this under Rs 1500?" },
    budget: { type: "number", nullable: true, example: 1500 },
    userContext: { type: "string", nullable: true, maxLength: 1000, example: "Prefer reliable warranty and fast delivery." },
  },
};

const actionSchema: SchemaObject = {
  type: "object",
  required: ["type", "label", "requiresApproval", "payload"],
  properties: {
    type: { type: "string", enum: ["none", "add_to_cart", "wishlist", "open_comparison", "ask_clarification"], example: "wishlist" },
    label: { type: "string", maxLength: 120, example: "Save to wishlist" },
    requiresApproval: { type: "boolean", example: true },
    payload: { type: "object", additionalProperties: true },
  },
};

const decisionSchema: SchemaObject = {
  type: "object",
  required: ["verdict", "confidence", "summary", "reasons", "risks", "checks", "action", "model"],
  properties: {
    verdict: { type: "string", enum: ["buy", "wait", "avoid", "compare", "unknown"], example: "buy" },
    confidence: { type: "number", minimum: 0, maximum: 1, example: 0.82 },
    summary: { type: "string", maxLength: 700, example: "Visible price and seller signals look acceptable." },
    reasons: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", maxLength: 220 } },
    risks: { type: "array", maxItems: 6, items: { type: "string", maxLength: 220 } },
    checks: { type: "array", maxItems: 6, items: { type: "string", maxLength: 220 } },
    action: actionSchema,
    model: { type: "string", example: "gemini-3.5-flash" },
  },
};

const evidenceSchema: SchemaObject = {
  type: "object",
  required: ["provider", "label", "purpose", "runtimePath", "mcpServer", "qualificationEvidence", "status", "transport", "tools", "notes"],
  properties: {
    provider: { type: "string", enum: ["mongodb", "elastic", "arize", "fivetran", "gitlab", "dynatrace"], example: "arize" },
    label: { type: "string", maxLength: 80, example: "Arize Phoenix" },
    purpose: { type: "string", maxLength: 180 },
    runtimePath: { type: "string", enum: ["agent-memory", "agent-evidence"], example: "agent-evidence" },
    mcpServer: {
      type: "object",
      required: ["implementation", "sourceUrl"],
      properties: {
        implementation: { type: "string", maxLength: 160, example: "Arize Phoenix MCP Server" },
        sourceUrl: { type: "string", format: "uri", example: "https://github.com/Arize-ai/phoenix" },
        launch: { type: "string", maxLength: 220, example: "npx @arizeai/phoenix-mcp@latest" },
      },
    },
    qualificationEvidence: {
      type: "array",
      maxItems: 5,
      items: { type: "string", maxLength: 220 },
      example: ["Reads Phoenix projects and recent traces through MCP for runtime evaluation evidence."],
    },
    status: { type: "string", enum: ["available", "configured", "disabled", "missing_config", "error"], example: "available" },
    transport: { type: "string", enum: ["http", "stdio", "remote", "not_configured"], example: "stdio" },
    tools: { type: "array", maxItems: 20, items: { type: "string" }, example: ["list-projects", "list-traces"] },
    notes: { type: "array", maxItems: 5, items: { type: "string", maxLength: 220 } },
  },
};

export const mcpCapabilitiesResponseOpenApiSchema: SchemaObject = {
  type: "object",
  required: ["checksEnabled", "generatedAt", "selectedTrack", "selectedConnector", "selectedTrackQualified", "connectors"],
  properties: {
    checksEnabled: { type: "boolean", example: true },
    generatedAt: { type: "string", format: "date-time" },
    selectedTrack: { type: "string", enum: ["mongodb", "elastic", "arize", "fivetran", "gitlab", "dynatrace"], example: "mongodb" },
    selectedConnector: {
      ...evidenceSchema,
      nullable: true,
      description: "Public, non-secret connector row for the selected Devpost track.",
    },
    selectedTrackQualified: {
      type: "boolean",
      example: true,
      description: "True when the selected Devpost track connector is at least configured, or available when live tool checks are enabled.",
    },
    connectors: {
      type: "array",
      items: evidenceSchema,
    },
  },
};

const evidenceContextSchema: SchemaObject = {
  ...evidenceSchema,
  required: [...(evidenceSchema.required ?? []), "generatedAt"],
  properties: { ...evidenceSchema.properties, generatedAt: { type: "string", format: "date-time" } },
};

const memorySchema: SchemaObject = {
  type: "object",
  required: ["enabled", "backend", "provider", "status", "tools", "similarProducts", "notes"],
  properties: {
    enabled: { type: "boolean", example: true },
    backend: { type: "string", enum: ["mongodb"], example: "mongodb" },
    provider: { type: "string", example: "MongoDB MCP Server" },
    status: { type: "string", enum: ["available", "disabled", "unavailable", "error"], example: "available" },
    tools: { type: "array", maxItems: 20, items: { type: "string" }, example: ["find", "insert-many"] },
    similarProducts: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          merchant: { type: "string", enum: ["amazon", "flipkart", "myntra", "generic"] },
          title: { type: "string" },
          url: { type: "string", format: "uri" },
          priceRaw: { type: "string", nullable: true },
          verdict: { type: "string", nullable: true, enum: ["buy", "wait", "avoid", "compare", "unknown"] },
          summary: { type: "string", nullable: true },
          checkedAt: { type: "string", nullable: true, format: "date-time" },
        },
      },
    },
    notes: { type: "array", maxItems: 5, items: { type: "string", maxLength: 220 } },
  },
};

export const analyzeRequestOpenApiSchema: SchemaObject = {
  type: "object",
  required: ["page", "intent"],
  properties: {
    page: productPageSchema,
    intent: intentSchema,
  },
};

export const analyzeResponseOpenApiSchema: SchemaObject = {
  type: "object",
  required: ["sessionId", "decision"],
  properties: {
    sessionId: { type: "string", format: "uuid", example: "4a44b220-a577-4502-bc7d-ab789f90429d" },
    decision: decisionSchema,
    memoryContext: memorySchema,
    evidenceContext: evidenceContextSchema,
    evidenceContexts: {
      type: "array",
      maxItems: 5,
      items: evidenceContextSchema,
    },
  },
};

export const approvalRequestOpenApiSchema: SchemaObject = {
  type: "object",
  required: ["sessionId", "action", "approved"],
  properties: {
    sessionId: { type: "string", format: "uuid" },
    action: actionSchema,
    approved: { type: "boolean", example: true },
  },
};

export const approvalResponseOpenApiSchema: SchemaObject = {
  type: "object",
  required: ["ok", "command"],
  properties: {
    ok: { type: "boolean", example: true },
    command: {
      type: "object",
      required: ["command", "selector", "url", "message"],
      properties: {
        command: { type: "string", enum: ["noop", "click_add_to_cart", "click_wishlist", "open_url"] },
        selector: { type: "string", nullable: true },
        url: { type: "string", format: "uri", nullable: true },
        message: { type: "string" },
      },
    },
  },
};

export const a2aSendMessageRequestOpenApiSchema: SchemaObject = {
  type: "object",
  required: ["message"],
  properties: {
    message: {
      type: "object",
      required: ["role", "messageId", "parts"],
      properties: {
        role: { type: "string", enum: ["ROLE_USER", "user"], example: "user" },
        kind: { type: "string", enum: ["message"], example: "message" },
        messageId: { type: "string", example: "msg-1" },
        contextId: { type: "string" },
        taskId: { type: "string" },
        parts: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["text", "data", "file"], example: "data" },
              data: analyzeRequestOpenApiSchema,
              text: { type: "string" },
              mediaType: { type: "string", example: "application/json" },
            },
          },
        },
      },
    },
    metadata: {
      type: "object",
      properties: {
        analyzeRequest: analyzeRequestOpenApiSchema,
      },
      additionalProperties: true,
    },
  },
};

export const a2aJsonRpcRequestOpenApiSchema: SchemaObject = {
  type: "object",
  required: ["jsonrpc", "method", "params"],
  properties: {
    jsonrpc: { type: "string", enum: ["2.0"], example: "2.0" },
    id: { oneOf: [{ type: "string" }, { type: "number" }], nullable: true },
    method: {
      type: "string",
      enum: [
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
      ],
      example: "message/send",
    },
    params: {
      oneOf: [
        a2aSendMessageRequestOpenApiSchema,
        {
          type: "object",
          properties: {
            id: { type: "string" },
            taskId: { type: "string" },
            name: { type: "string", example: "tasks/4a44b220-a577-4502-bc7d-ab789f90429d" },
            historyLength: { type: "integer", minimum: 0, maximum: 50 },
          },
          additionalProperties: true,
        },
      ],
    },
  },
};

export const a2aTaskOpenApiSchema: SchemaObject = {
  type: "object",
  required: ["id", "contextId", "status", "kind"],
  properties: {
    id: { type: "string" },
    contextId: { type: "string" },
    kind: { type: "string", enum: ["task"] },
    status: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["completed", "input-required", "failed"] },
        timestamp: { type: "string", format: "date-time" },
      },
      additionalProperties: true,
    },
    artifacts: { type: "array", items: { type: "object", additionalProperties: true } },
    metadata: { type: "object", additionalProperties: true },
  },
};

export const a2aTaskResponseOpenApiSchema: SchemaObject = {
  type: "object",
  required: ["task"],
  properties: {
    task: a2aTaskOpenApiSchema,
  },
};
