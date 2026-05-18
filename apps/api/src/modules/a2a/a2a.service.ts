import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { AgentDecisionSchema, type AnalyzeResponse } from "@bazaarlens/shared";
import { getEnv } from "../../shared/env.js";
import { AgentService } from "../agent/agent.service.js";
import { mcpConnectorConfigs, selectedMcpConnectorConfig } from "../mcp/mcp-connectors.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { extractAnalyzeRequest, type A2aSendMessageRequest } from "./a2a.schemas.js";

interface PersistedTaskSession {
  readonly id: string;
  readonly decision: unknown;
  readonly createdAt: Date;
  readonly productSnapshot: {
    readonly merchant: string;
    readonly url: string;
    readonly title: string;
    readonly priceAmount: number | null;
    readonly priceRaw: string | null;
    readonly seller: string | null;
    readonly availability: string | null;
  };
}

@Injectable()
export class A2aService {
  private readonly env = getEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentService,
  ) {}

  agentCard() {
    const publicApi = this.env.API_PUBLIC_URL.replace(/\/$/, "");
    const profile = agentCardProfile(this.env);
    return {
      protocolVersion: "0.3",
      name: "BazaarLens",
      description:
        `Approval-gated shopping agent for Indian ecommerce. Analyzes visible Amazon.in, Flipkart, Myntra, and generic product-page evidence${profile.evidenceLabels.length ? ` with ${profile.evidenceLabels.join(", ")} context` : ""} before recommending safe next actions.`,
      url: `${publicApi}/a2a`,
      preferredTransport: "JSONRPC",
      version: "0.1.0",
      documentationUrl: `${publicApi}/docs`,
      iconUrl: "https://bazaarlens.xyz/favicon.svg",
      provider: {
        organization: "BazaarLens",
        url: "https://bazaarlens.xyz",
      },
      supportedInterfaces: [
        {
          url: `${publicApi}/a2a`,
          protocolBinding: "JSONRPC",
          protocolVersion: "0.3",
        },
        {
          url: `${publicApi}/v1/message:send`,
          protocolBinding: "HTTP+JSON",
          protocolVersion: "0.3",
        },
      ],
      additionalInterfaces: [
        {
          url: `${publicApi}/a2a`,
          transport: "JSONRPC",
        },
        {
          url: `${publicApi}/v1`,
          transport: "HTTP+JSON",
        },
      ],
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      supportsAuthenticatedExtendedCard: false,
      securitySchemes: {
        bazaarlensA2aKey: {
          type: "apiKey",
          in: "header",
          name: "x-bazaarlens-a2a-key",
          description: "Shared secret configured as A2A_AGENT_KEY in the BazaarLens API.",
        },
      },
      security: [{ bazaarlensA2aKey: [] }],
      securityRequirements: [{ bazaarlensA2aKey: [] }],
      defaultInputModes: ["application/json", "text/plain"],
      defaultOutputModes: ["application/json", "text/plain"],
      metadata: {
        modelProvider: "google-vertex",
        model: this.env.GOOGLE_VERTEX_MODEL,
        googleAgentPlatform: "Gemini Enterprise custom A2A registration",
        a2aProtocolVersion: "0.3",
        primaryJsonRpcEndpoint: `${publicApi}/a2a`,
        primaryHttpJsonEndpoint: `${publicApi}/v1/message:send`,
        memoryProvider: profile.memoryLabel,
        evidenceProviders: profile.evidenceProviders,
        supportedStores: ["amazon.in", "flipkart", "myntra"],
        safetyBoundary: "No checkout, payment, OTP, address, credential, or final-order automation.",
      },
      skills: [
        {
          id: "product-buying-check",
          name: "Product Buying Check",
          description: `Evaluate visible product-page evidence${profile.memoryLabel ? `, use ${profile.memoryLabel} buying memory` : ""}${profile.evidenceLabels.length ? `, use ${profile.evidenceLabels.join(", ")} connected evidence` : ""}, and return a verdict, risks, checks, and approval-gated action.`,
          tags: ["shopping", "ecommerce", "india", "approval", "mcp", ...profile.tags],
          examples: [
            "Should I buy this boAt earbuds listing under Rs 1500?",
            "Check whether this Flipkart phone deal looks safe.",
            "Use the visible Myntra product page data and tell me whether to buy or wait.",
          ],
          inputModes: ["application/json"],
          outputModes: ["application/json", "text/plain"],
          security: [{ bazaarlensA2aKey: [] }],
          securityRequirements: [{ bazaarlensA2aKey: [] }],
        },
      ],
    };
  }

  submissionProfile() {
    const publicApi = this.env.API_PUBLIC_URL.replace(/\/$/, "");
    const profile = agentCardProfile(this.env);
    const selectedConnector = selectedMcpConnectorConfig(this.env);
    const hostedProjectUrl = publicWebUrl(this.env);
    return {
      name: "BazaarLens",
      version: "0.1.0",
      product: "Approval-gated buying agent for Indian ecommerce.",
      selectedTrack: this.env.HACKATHON_TRACK,
      submission: {
        hostedProjectUrl,
        sourceCodeUrl: "https://github.com/aryan877/bazaarlens",
        repositoryVisibility: "private_until_devpost_submission",
        openSourceLicense: "MIT",
        licenseFile: "LICENSE",
        demoVideoUrl: null,
        requiredArtifacts: {
          hostedProject: hostedProjectUrl,
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
          primaryImportUrl: `${publicApi}/.well-known/agent.json`,
          openApiToolSchemaUrl: `${publicApi}/openapi.json`,
          authHeader: "x-bazaarlens-a2a-key",
        },
        agentCardUrl: `${publicApi}/.well-known/agent.json`,
        agentCardCompatibilityUrl: `${publicApi}/.well-known/agent-card.json`,
        openApiUrl: `${publicApi}/openapi.json`,
        a2aJsonRpcUrl: `${publicApi}/a2a`,
        a2aHttpJsonUrl: `${publicApi}/v1/message:send`,
        a2aHttpJsonStreamUrl: `${publicApi}/v1/message:stream`,
        a2aHttpJsonCompatibilityUrl: `${publicApi}/a2a/message:send`,
        a2aHttpJsonStreamCompatibilityUrl: `${publicApi}/a2a/message:stream`,
        a2aTaskLookupUrlTemplate: `${publicApi}/v1/tasks/{taskId}`,
        a2aTaskCancelUrlTemplate: `${publicApi}/v1/tasks/{taskId}:cancel`,
        docsUrl: `${publicApi}/docs`,
      },
      model: {
        provider: "google-vertex",
        model: this.env.GOOGLE_VERTEX_MODEL,
      },
      stores: ["amazon.in", "flipkart", "myntra"],
      safety: {
        approvalRequiredFor: ["add_to_cart", "wishlist", "open_comparison"],
        blockedAutomation: ["checkout", "payment", "otp", "address_change", "credential_entry", "final_order"],
      },
      memory: {
        provider: profile.memoryLabel,
        configured: Boolean(profile.memoryLabel),
      },
      selectedPartnerMcp: selectedConnector
        ? {
            provider: selectedConnector.provider,
            label: selectedConnector.label,
            purpose: selectedConnector.purpose,
            enabled: selectedConnector.enabled,
            configured: selectedConnector.configured,
            transport: selectedConnector.transport,
            runtimePath: selectedConnector.runtimePath,
            mcpServer: selectedConnector.mcpServer,
            qualificationEvidence: selectedConnector.qualificationEvidence,
          }
        : null,
      selectedTrackReadiness: selectedConnector
        ? {
            provider: selectedConnector.provider,
            label: selectedConnector.label,
            enabled: selectedConnector.enabled,
            configured: selectedConnector.configured,
            transport: selectedConnector.transport,
            qualified: selectedConnector.enabled && selectedConnector.configured,
            runtimePath: selectedConnector.runtimePath,
            mcpServer: selectedConnector.mcpServer,
            qualificationEvidence: selectedConnector.qualificationEvidence,
          }
        : null,
      qualification: {
        poweredByGemini: true,
        googleAgentPlatformSurface: true,
        partnerMcpIntegrated: Boolean(selectedConnector?.enabled && selectedConnector.configured),
        multiStepAgentFlow: true,
        humanOversight: true,
      },
      evidenceProviders: profile.evidenceProviders,
      connectors: publicConnectorProfile(this.env),
    };
  }

  async sendMessage(input: A2aSendMessageRequest) {
    const analyzeRequest = extractAnalyzeRequest(input);
    if (!analyzeRequest) {
      return {
        task: this.inputRequiredTask(input, "Send a data part or metadata.analyzeRequest matching the BazaarLens AnalyzeRequest schema. I need visible product-page facts before I can make a buying recommendation."),
      };
    }

    const user = await this.prisma.user.upsert({
      where: { email: this.env.A2A_AGENT_USER_EMAIL },
      update: {},
      create: {
        email: this.env.A2A_AGENT_USER_EMAIL,
        name: "BazaarLens A2A Agent",
      },
      select: { id: true },
    });
    const response = await this.agent.analyze(user.id, analyzeRequest);
    return { task: this.completedTask(input, response) };
  }

  async getTask(taskId: string, historyLength?: number) {
    const session = await this.prisma.agentSession.findUnique({
      where: { id: taskId },
      include: { productSnapshot: true },
    });
    if (!session) return null;
    return this.taskFromSession(session, historyLength);
  }

  async cancelTask(taskId: string) {
    const task = await this.getTask(taskId);
    if (!task) return null;
    return {
      ...task,
      metadata: {
        ...task.metadata,
        cancelResult: "already_terminal",
        cancelReason: "BazaarLens product checks complete synchronously; no running task remained to cancel.",
      },
    };
  }

  private inputRequiredTask(input: A2aSendMessageRequest, text: string) {
    const ids = idsFor(input);
    const message = agentMessage(ids, text);
    return {
      id: ids.taskId,
      contextId: ids.contextId,
      status: {
        state: "input-required",
        message,
        timestamp: new Date().toISOString(),
      },
      history: [normalizeClientMessage(input.message), message],
      kind: "task",
      metadata: {
        reason: "missing_product_page_payload",
      },
    };
  }

  private completedTask(input: A2aSendMessageRequest, response: AnalyzeResponse) {
    const ids = idsFor(input, response.sessionId);
    const summary = summaryText(response);
    const message = agentMessage(ids, summary);
    return {
      id: ids.taskId,
      contextId: ids.contextId,
      status: {
        state: "completed",
        message,
        timestamp: new Date().toISOString(),
      },
      artifacts: [
        {
          kind: "artifact",
          artifactId: `artifact-${response.sessionId}`,
          name: "BazaarLens buying decision",
          description: "Structured buying verdict, risks, checks, action, memory context, and MCP evidence contexts.",
          parts: [
            {
              kind: "data",
              data: response,
              mediaType: "application/json",
            },
            {
              kind: "text",
              text: summary,
              mediaType: "text/plain",
            },
          ],
        },
      ],
      history: [normalizeClientMessage(input.message), message],
      kind: "task",
      metadata: {
        bazaarlensSessionId: response.sessionId,
        verdict: response.decision.verdict,
        actionType: response.decision.action.type,
        memoryStatus: response.memoryContext?.status ?? null,
        evidenceProvider: response.evidenceContext?.provider ?? null,
        evidenceStatus: response.evidenceContext?.status ?? null,
        evidenceProviders: evidenceProviders(response),
      },
    };
  }

  private taskFromSession(session: PersistedTaskSession, historyLength = 10) {
    const decision = AgentDecisionSchema.parse(session.decision);
    const response: AnalyzeResponse = {
      sessionId: session.id,
      decision,
    };
    const ids = { contextId: session.id, taskId: session.id };
    const message = agentMessage(ids, summaryText(response));
    const task = {
      id: session.id,
      contextId: session.id,
      status: {
        state: "completed",
        message,
        timestamp: session.createdAt.toISOString(),
      },
      artifacts: [
        {
          kind: "artifact",
          artifactId: `artifact-${session.id}`,
          name: "BazaarLens buying decision",
          description: "Structured buying verdict and persisted product snapshot for this A2A task.",
          parts: [
            {
              kind: "data",
              data: {
                sessionId: session.id,
                decision,
                page: {
                  merchant: session.productSnapshot.merchant,
                  url: session.productSnapshot.url,
                  title: session.productSnapshot.title,
                  priceAmount: session.productSnapshot.priceAmount,
                  priceRaw: session.productSnapshot.priceRaw,
                  seller: session.productSnapshot.seller,
                  availability: session.productSnapshot.availability,
                },
              },
              mediaType: "application/json",
            },
            {
              kind: "text",
              text: summaryText(response),
              mediaType: "text/plain",
            },
          ],
        },
      ],
      history: historyLength > 0 ? [message].slice(-historyLength) : [],
      kind: "task",
      metadata: {
        bazaarlensSessionId: session.id,
        verdict: decision.verdict,
        actionType: decision.action.type,
        storedAt: session.createdAt.toISOString(),
      },
    };
    return task;
  }
}

function idsFor(input: A2aSendMessageRequest, taskId: string = randomUUID()) {
  return {
    contextId: input.message.contextId ?? taskId,
    taskId,
  };
}

function agentMessage(ids: { contextId: string; taskId: string }, text: string) {
  return {
    kind: "message",
    messageId: randomUUID(),
    contextId: ids.contextId,
    taskId: ids.taskId,
    role: "agent",
    parts: [{ kind: "text", text, mediaType: "text/plain" }],
  };
}

function normalizeClientMessage(message: A2aSendMessageRequest["message"]) {
  return {
    ...message,
    kind: "message",
    role: message.role === "ROLE_AGENT" ? "agent" : "user",
    parts: message.parts.map((part) => ({
      ...part,
      kind: part.kind ?? partKind(part),
    })),
  };
}

function partKind(part: A2aSendMessageRequest["message"]["parts"][number]): "text" | "data" | "file" {
  if ("text" in part) return "text";
  if ("data" in part) return "data";
  return "file";
}

function summaryText(response: AnalyzeResponse): string {
  const decision = response.decision;
  const approval = decision.action.requiresApproval ? " Requires explicit approval before any browser action." : "";
  return `${decision.verdict.toUpperCase()} (${Math.round(decision.confidence * 100)}%). ${decision.summary}${approval}`;
}

function evidenceProviders(response: AnalyzeResponse): string[] {
  if (response.evidenceContexts?.length) return response.evidenceContexts.map((context) => context.provider);
  return response.evidenceContext ? [response.evidenceContext.provider] : [];
}

function agentCardProfile(env: ReturnType<typeof getEnv>) {
  const configs = mcpConnectorConfigs(env);
  const memory = configs.find((config) => config.provider === "mongodb");
  const evidence = cardEvidenceConfigs(env);
  return {
    memoryLabel: memory?.enabled && memory.configured ? memory.label : null,
    evidenceProviders: evidence.map((config) => config.provider),
    evidenceLabels: evidence.map((config) => config.label),
    tags: [
      memory?.enabled && memory.configured ? "mongodb-memory" : null,
      ...evidence.map((config) => `${config.provider}-evidence`),
    ].filter((tag): tag is string => Boolean(tag)),
  };
}

function cardEvidenceConfigs(env: ReturnType<typeof getEnv>) {
  const configs = mcpConnectorConfigs(env);
  const selected = selectedMcpConnectorConfig(env);
  const selector = splitList(env.AGENT_EVIDENCE_PROVIDERS.toLowerCase());
  const ordered = new Map<string, (typeof configs)[number]>();
  const add = (config: (typeof configs)[number] | undefined) => {
    if (!config || config.provider === "mongodb" || !config.enabled || !config.configured) return;
    ordered.set(config.provider, config);
  };

  if (selector.includes("all")) {
    for (const config of configs) add(config);
    return [...ordered.values()];
  }

  add(selected);
  for (const provider of selector) {
    add(configs.find((config) => config.provider === provider));
  }
  return [...ordered.values()];
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function publicWebUrl(env: ReturnType<typeof getEnv>): string {
  const firstOrigin = splitList(env.CORS_ORIGIN)[0];
  return firstOrigin && !isLocalUrl(firstOrigin) ? firstOrigin : "https://bazaarlens.xyz";
}

function isLocalUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function publicConnectorProfile(env: ReturnType<typeof getEnv>) {
  return mcpConnectorConfigs(env).map((config) => ({
    provider: config.provider,
    label: config.label,
    purpose: config.purpose,
    enabled: config.enabled,
    configured: config.configured,
    transport: config.transport,
    runtimePath: config.runtimePath,
    mcpServer: config.mcpServer,
    qualificationEvidence: config.qualificationEvidence,
  }));
}
