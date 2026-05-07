import { z } from "zod";

const DEFAULT_JWT_SECRET = "replace-with-a-strong-dev-secret";
const GOOGLE_WEB_CLIENT_ID_PATTERN = /^[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
const HackathonTrackSchema = z.enum(["mongodb", "arize", "elastic", "fivetran", "gitlab", "dynatrace"]);
const EVIDENCE_PROVIDERS = ["arize", "elastic", "fivetran", "gitlab", "dynatrace"] as const;
type EvidenceProvider = (typeof EVIDENCE_PROVIDERS)[number];
const EnvBoolSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off", ""].includes(value.toLowerCase())) return false;
  return value;
}, z.boolean());

const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  API_PUBLIC_URL: z.string().url().default("http://localhost:8787"),
  CORS_ORIGIN: z.string().optional().default(""),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().regex(/^\d+(ms|s|m|h|d|w|y)$/).default("14d"),
  GOOGLE_CLIENT_ID: z
    .string()
    .trim()
    .default("")
    .refine((value) => !value || GOOGLE_WEB_CLIENT_ID_PATTERN.test(value), {
      message: "GOOGLE_CLIENT_ID must be a Google OAuth web client ID ending in .apps.googleusercontent.com",
    }),
  A2A_AGENT_KEY: z.string().trim().optional().default(""),
  A2A_AGENT_USER_EMAIL: z.email().default("a2a-agent@bazaarlens.app"),
  GOOGLE_VERTEX_API_KEY: z.string().optional().default(""),
  GOOGLE_VERTEX_PROJECT: z.string().optional().default(""),
  GOOGLE_CLOUD_PROJECT: z.string().optional().default(""),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().trim().optional().default(""),
  GOOGLE_VERTEX_LOCATION: z.string().optional().default("global"),
  GOOGLE_VERTEX_MODEL: z.string().default("gemini-3.5-flash"),
  HACKATHON_TRACK: HackathonTrackSchema.default("mongodb"),
  AGENT_EVIDENCE_PROVIDERS: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine(isEvidenceProviderSelector, {
      message:
        "AGENT_EVIDENCE_PROVIDERS must be empty, all, or comma-separated non-Mongo providers: arize, elastic, fivetran, gitlab, dynatrace",
    }),
  AGENT_MEMORY_ENABLED: EnvBoolSchema.default(false),
  AGENT_MEMORY_BACKEND: z.literal("mongodb").default("mongodb"),
  AGENT_MEMORY_MCP_HTTP_URL: z
    .string()
    .trim()
    .default("")
    .refine((value) => !value || z.url().safeParse(value).success, {
      message: "AGENT_MEMORY_MCP_HTTP_URL must be a valid URL",
    }),
  AGENT_MEMORY_MCP_COMMAND: z.string().trim().optional().default(""),
  AGENT_MEMORY_MCP_ARGS: z.string().trim().optional().default(""),
  MONGODB_MEMORY_CONNECTION_STRING: z.string().trim().optional().default(""),
  MONGODB_MEMORY_DATABASE: z.string().trim().min(1).default("bazaarlens_agent"),
  MONGODB_MEMORY_COLLECTION: z.string().trim().min(1).default("product_memory"),
  MCP_READINESS_CHECKS_ENABLED: EnvBoolSchema.default(false),
  MCP_READINESS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(5000),
  ELASTIC_MCP_ENABLED: EnvBoolSchema.default(false),
  ELASTIC_MCP_HTTP_URL: z
    .string()
    .trim()
    .default("")
    .refine((value) => !value || z.url().safeParse(value).success, {
      message: "ELASTIC_MCP_HTTP_URL must be a valid URL",
    }),
  ELASTIC_MCP_COMMAND: z.string().trim().optional().default(""),
  ELASTIC_MCP_ARGS: z.string().trim().optional().default(""),
  ELASTIC_KIBANA_URL: z
    .string()
    .trim()
    .default("")
    .refine((value) => !value || z.url().safeParse(value).success, {
      message: "ELASTIC_KIBANA_URL must be a valid URL",
    }),
  ELASTIC_KIBANA_SPACE: z.string().trim().optional().default(""),
  ELASTIC_API_KEY: z.string().trim().optional().default(""),
  ELASTIC_PRODUCT_INDEX: z.string().trim().optional().default(""),
  ELASTIC_PRODUCT_SEARCH_TOOL: z.string().trim().optional().default(""),
  ELASTIC_PRODUCT_SOURCE_FIELDS: z.string().trim().optional().default("title,merchant,priceRaw,url,seller,rating,reviewCount,availability,checkedAt"),
  ES_URL: z.string().trim().optional().default(""),
  ES_API_KEY: z.string().trim().optional().default(""),
  ES_USERNAME: z.string().trim().optional().default(""),
  ES_PASSWORD: z.string().trim().optional().default(""),
  ES_SSL_SKIP_VERIFY: EnvBoolSchema.default(false),
  ARIZE_MCP_ENABLED: EnvBoolSchema.default(false),
  ARIZE_MCP_COMMAND: z.string().trim().optional().default("npx"),
  ARIZE_MCP_ARGS: z.string().trim().optional().default(""),
  FIVETRAN_MCP_ENABLED: EnvBoolSchema.default(false),
  FIVETRAN_MCP_COMMAND: z.string().trim().optional().default("uvx"),
  FIVETRAN_MCP_ARGS: z.string().trim().optional().default(""),
  FIVETRAN_API_KEY: z.string().trim().optional().default(""),
  FIVETRAN_API_SECRET: z.string().trim().optional().default(""),
  FIVETRAN_ALLOW_WRITES: EnvBoolSchema.default(false),
  GITLAB_MCP_ENABLED: EnvBoolSchema.default(false),
  GITLAB_MCP_HTTP_URL: z
    .string()
    .trim()
    .default("")
    .refine((value) => !value || z.url().safeParse(value).success, {
      message: "GITLAB_MCP_HTTP_URL must be a valid URL",
    }),
  GITLAB_MCP_COMMAND: z.string().trim().optional().default(""),
  GITLAB_MCP_ARGS: z.string().trim().optional().default(""),
  GITLAB_MCP_AUTH_READY: EnvBoolSchema.default(false),
  GITLAB_PROJECT_ID: z.string().trim().optional().default(""),
  DYNATRACE_MCP_ENABLED: EnvBoolSchema.default(false),
  DYNATRACE_MCP_HTTP_URL: z
    .string()
    .trim()
    .default("")
    .refine((value) => !value || z.url().safeParse(value).success, {
      message: "DYNATRACE_MCP_HTTP_URL must be a valid URL",
    }),
  DYNATRACE_ENVIRONMENT_URL: z
    .string()
    .trim()
    .default("")
    .refine((value) => !value || z.url().safeParse(value).success, {
      message: "DYNATRACE_ENVIRONMENT_URL must be a valid URL",
    }),
  DYNATRACE_API_TOKEN: z.string().trim().optional().default(""),
  PHOENIX_TRACING_ENABLED: EnvBoolSchema.default(false),
  PHOENIX_COLLECTOR_ENDPOINT: z
    .string()
    .trim()
    .default("")
    .refine((value) => !value || z.url().safeParse(value).success, {
      message: "PHOENIX_COLLECTOR_ENDPOINT must be a valid URL",
    }),
  PHOENIX_HOST: z.string().trim().optional().default(""),
  PHOENIX_API_KEY: z.string().trim().optional().default(""),
  PHOENIX_PROJECT: z.string().trim().optional().default(""),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_DEFAULT_LIMIT: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_AUTH_LIMIT: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_AGENT_ANALYZE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_AGENT_ANALYZE_LIMIT: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_AGENT_APPROVAL_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_AGENT_APPROVAL_LIMIT: z.coerce.number().int().positive().default(60),
});

const EnvSchema = BaseEnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;

  if (env.JWT_SECRET === DEFAULT_JWT_SECRET || env.JWT_SECRET.length < 32) {
    ctx.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "JWT_SECRET must be a non-default value with at least 32 characters in production",
    });
  }

  if (!env.GOOGLE_VERTEX_API_KEY && !env.GOOGLE_VERTEX_PROJECT && !env.GOOGLE_CLOUD_PROJECT) {
    ctx.addIssue({
      code: "custom",
      path: ["GOOGLE_VERTEX_API_KEY"],
      message: "GOOGLE_VERTEX_API_KEY, GOOGLE_VERTEX_PROJECT, or GOOGLE_CLOUD_PROJECT is required in production",
    });
  }

  if (env.A2A_AGENT_KEY.length < 32) {
    ctx.addIssue({
      code: "custom",
      path: ["A2A_AGENT_KEY"],
      message: "A2A_AGENT_KEY must be at least 32 characters in production",
    });
  }

  if (!isSelectedTrackConfigured(env)) {
    ctx.addIssue({
      code: "custom",
      path: ["HACKATHON_TRACK"],
      message: `${env.HACKATHON_TRACK} track requires its MCP connector to be enabled and configured`,
    });
  }

  const requestedEvidenceProviders = explicitEvidenceProviders(env.AGENT_EVIDENCE_PROVIDERS);
  for (const provider of requestedEvidenceProviders) {
    if (!isEvidenceProviderConfigured(env, provider)) {
      ctx.addIssue({
        code: "custom",
        path: ["AGENT_EVIDENCE_PROVIDERS"],
        message: `${provider} evidence provider is requested but is not enabled and configured for runtime evidence`,
      });
    }
  }

  if (requestsAllEvidenceProviders(env.AGENT_EVIDENCE_PROVIDERS)) {
    const enabledEvidenceProviders = EVIDENCE_PROVIDERS.filter((provider) => isEvidenceProviderEnabled(env, provider));
    if (!enabledEvidenceProviders.length) {
      ctx.addIssue({
        code: "custom",
        path: ["AGENT_EVIDENCE_PROVIDERS"],
        message: "AGENT_EVIDENCE_PROVIDERS=all requires at least one non-Mongo evidence provider to be enabled and configured",
      });
    }

    for (const provider of enabledEvidenceProviders) {
      if (!isEvidenceProviderConfigured(env, provider)) {
        ctx.addIssue({
          code: "custom",
          path: ["AGENT_EVIDENCE_PROVIDERS"],
          message: `AGENT_EVIDENCE_PROVIDERS=all includes enabled ${provider}, but it is not configured for runtime evidence`,
        });
      }
    }
  }

  if (env.AGENT_MEMORY_ENABLED && env.AGENT_MEMORY_BACKEND === "mongodb" && !isMongoDbConfigured(env)) {
    ctx.addIssue({
      code: "custom",
      path: ["MONGODB_MEMORY_CONNECTION_STRING"],
      message: "MONGODB_MEMORY_CONNECTION_STRING or AGENT_MEMORY_MCP_HTTP_URL is required when MongoDB MCP is enabled",
    });
  }

  if (env.PHOENIX_TRACING_ENABLED && !env.PHOENIX_COLLECTOR_ENDPOINT && !env.PHOENIX_HOST) {
    ctx.addIssue({
      code: "custom",
      path: ["PHOENIX_COLLECTOR_ENDPOINT"],
      message: "PHOENIX_COLLECTOR_ENDPOINT or PHOENIX_HOST is required when Phoenix tracing is enabled",
    });
  }

  if (!env.CORS_ORIGIN) {
    ctx.addIssue({
      code: "custom",
      path: ["CORS_ORIGIN"],
      message: "CORS_ORIGIN is required in production",
    });
  }

  if (isLocalUrl(env.API_PUBLIC_URL)) {
    ctx.addIssue({
      code: "custom",
      path: ["API_PUBLIC_URL"],
      message: "API_PUBLIC_URL must be a public URL in production",
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  return EnvSchema.parse(process.env);
}

function isLocalUrl(value: string): boolean {
  const hostname = new URL(value).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isSelectedTrackConfigured(env: z.infer<typeof BaseEnvSchema>): boolean {
  if (env.HACKATHON_TRACK === "mongodb") {
    return env.AGENT_MEMORY_ENABLED && env.AGENT_MEMORY_BACKEND === "mongodb" && isMongoDbConfigured(env);
  }
  if (env.HACKATHON_TRACK === "arize") {
    return env.ARIZE_MCP_ENABLED && env.PHOENIX_TRACING_ENABLED && Boolean(env.PHOENIX_HOST && env.PHOENIX_API_KEY);
  }
  if (env.HACKATHON_TRACK === "elastic") {
    return env.ELASTIC_MCP_ENABLED && isElasticConfigured(env) && isElasticProductEvidenceConfigured(env);
  }
  if (env.HACKATHON_TRACK === "fivetran") {
    return env.FIVETRAN_MCP_ENABLED && isFivetranConfigured(env);
  }
  if (env.HACKATHON_TRACK === "gitlab") {
    return env.GITLAB_MCP_ENABLED && isGitLabConfigured(env);
  }
  if (env.HACKATHON_TRACK === "dynatrace") {
    return env.DYNATRACE_MCP_ENABLED && isDynatraceConfigured(env);
  }
  return false;
}

function isEvidenceProviderSelector(value: string): boolean {
  const providers = splitList(value.toLowerCase());
  if (!providers.length) return true;
  if (providers.includes("all")) return providers.length === 1;
  return providers.every((provider) => isEvidenceProvider(provider));
}

function explicitEvidenceProviders(value: string): EvidenceProvider[] {
  const providers = splitList(value.toLowerCase());
  if (!providers.length || providers.includes("all")) return [];
  return [...new Set(providers.filter(isEvidenceProvider))];
}

function requestsAllEvidenceProviders(value: string): boolean {
  return splitList(value.toLowerCase()).includes("all");
}

function isEvidenceProvider(value: string): value is EvidenceProvider {
  return EVIDENCE_PROVIDERS.includes(value as EvidenceProvider);
}

function isEvidenceProviderEnabled(env: z.infer<typeof BaseEnvSchema>, provider: EvidenceProvider): boolean {
  if (provider === "arize") return env.ARIZE_MCP_ENABLED;
  if (provider === "elastic") return env.ELASTIC_MCP_ENABLED;
  if (provider === "fivetran") return env.FIVETRAN_MCP_ENABLED;
  if (provider === "gitlab") return env.GITLAB_MCP_ENABLED;
  if (provider === "dynatrace") return env.DYNATRACE_MCP_ENABLED;
  return false;
}

function isEvidenceProviderConfigured(env: z.infer<typeof BaseEnvSchema>, provider: EvidenceProvider): boolean {
  if (provider === "arize") {
    return env.ARIZE_MCP_ENABLED && env.PHOENIX_TRACING_ENABLED && Boolean(env.PHOENIX_HOST && env.PHOENIX_API_KEY);
  }
  if (provider === "elastic") {
    return env.ELASTIC_MCP_ENABLED && isElasticConfigured(env) && isElasticProductEvidenceConfigured(env);
  }
  if (provider === "fivetran") {
    return env.FIVETRAN_MCP_ENABLED && isFivetranConfigured(env);
  }
  if (provider === "gitlab") {
    return env.GITLAB_MCP_ENABLED && isGitLabConfigured(env);
  }
  if (provider === "dynatrace") {
    return env.DYNATRACE_MCP_ENABLED && isDynatraceConfigured(env);
  }
  return false;
}

function isMongoDbConfigured(env: z.infer<typeof BaseEnvSchema>): boolean {
  return Boolean(env.AGENT_MEMORY_MCP_HTTP_URL || env.MONGODB_MEMORY_CONNECTION_STRING);
}

function isElasticConfigured(env: z.infer<typeof BaseEnvSchema>): boolean {
  const hasEndpoint = Boolean(env.ELASTIC_MCP_HTTP_URL || env.ELASTIC_KIBANA_URL || (env.ELASTIC_MCP_COMMAND && env.ELASTIC_MCP_ARGS));
  const hasAuth = Boolean(env.ELASTIC_API_KEY || env.ES_API_KEY || (env.ES_USERNAME && env.ES_PASSWORD));
  return hasEndpoint && hasAuth;
}

function isElasticProductEvidenceConfigured(env: z.infer<typeof BaseEnvSchema>): boolean {
  return Boolean(env.ELASTIC_PRODUCT_INDEX || env.ELASTIC_PRODUCT_SEARCH_TOOL);
}

function isFivetranConfigured(env: z.infer<typeof BaseEnvSchema>): boolean {
  return Boolean(env.FIVETRAN_API_KEY && env.FIVETRAN_API_SECRET && (env.FIVETRAN_MCP_COMMAND || env.FIVETRAN_MCP_ARGS));
}

function isGitLabConfigured(env: z.infer<typeof BaseEnvSchema>): boolean {
  return Boolean(env.GITLAB_PROJECT_ID && env.GITLAB_MCP_AUTH_READY && (env.GITLAB_MCP_HTTP_URL || (env.GITLAB_MCP_COMMAND && env.GITLAB_MCP_ARGS)));
}

function isDynatraceConfigured(env: z.infer<typeof BaseEnvSchema>): boolean {
  return Boolean(env.DYNATRACE_API_TOKEN && (env.DYNATRACE_MCP_HTTP_URL || env.DYNATRACE_ENVIRONMENT_URL));
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
