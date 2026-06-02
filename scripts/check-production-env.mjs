import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getEnvPath, hasFlag, loadEnvFile } from "./lib/env-file.mjs";
import { isGoogleWebClientId } from "./lib/google-oauth-env.mjs";

const argv = process.argv.slice(2);
const requireGoogle = hasFlag(argv, "--require-google") || process.env.REQUIRE_GOOGLE === "1";
const envPath = getEnvPath(argv, null, { ignoredFlags: ["--require-google"] });

if (envPath) {
  Object.assign(process.env, loadEnvFile(envPath));
}

process.env.NODE_ENV = "production";

const distEnvPath = resolve("apps/api/dist/shared/env.js");
if (!existsSync(distEnvPath)) {
  console.error("API build output is missing. Run `pnpm --filter @bazaarlens/api build` first.");
  process.exit(1);
}

try {
  const { getEnv } = await import(`file://${distEnvPath}`);
  const env = getEnv();
  const ingress = validateIngressEnv(process.env, env, { requireGoogle });
  console.log(
    JSON.stringify(
      {
        ok: true,
        nodeEnv: env.NODE_ENV,
        apiPublicUrl: env.API_PUBLIC_URL,
        corsOrigins: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean).length,
        jwtExpiresIn: env.JWT_EXPIRES_IN,
        googleVertexModel: env.GOOGLE_VERTEX_MODEL,
        googleVertexConfigured: Boolean(env.GOOGLE_VERTEX_API_KEY || env.GOOGLE_VERTEX_PROJECT || env.GOOGLE_CLOUD_PROJECT),
        googleVertexAuthMode: googleVertexAuthMode(env),
        a2aAgentConfigured: Boolean(env.A2A_AGENT_KEY),
        hackathonTrack: env.HACKATHON_TRACK,
        agentEvidenceProviders: env.AGENT_EVIDENCE_PROVIDERS || (env.HACKATHON_TRACK === "mongodb" ? "none" : env.HACKATHON_TRACK),
        agentMemory: {
          enabled: env.AGENT_MEMORY_ENABLED,
          backend: env.AGENT_MEMORY_BACKEND,
          configured: Boolean(env.AGENT_MEMORY_MCP_HTTP_URL || env.MONGODB_MEMORY_CONNECTION_STRING),
        },
        phoenixTracing: {
          enabled: env.PHOENIX_TRACING_ENABLED,
          configured: Boolean((env.PHOENIX_COLLECTOR_ENDPOINT || env.PHOENIX_HOST) && (env.PHOENIX_PROJECT || env.PHOENIX_API_KEY)),
        },
        connectedSystems: connectedSystems(env),
        googleConfigured: Boolean(env.GOOGLE_CLIENT_ID),
        googleRequired: requireGoogle,
        trustProxyHops: env.TRUST_PROXY_HOPS,
        ingress,
        rateLimits: {
          default: env.RATE_LIMIT_DEFAULT_LIMIT,
          auth: env.RATE_LIMIT_AUTH_LIMIT,
          agentAnalyze: env.RATE_LIMIT_AGENT_ANALYZE_LIMIT,
          agentApproval: env.RATE_LIMIT_AGENT_APPROVAL_LIMIT,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Production environment validation failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function validateIngressEnv(values, env, options) {
  const appDomain = requireHostname(values.APP_DOMAIN, "APP_DOMAIN");
  const apiDomain = requireHostname(values.API_DOMAIN, "API_DOMAIN");
  const acmeEmail = requireEmail(values.ACME_EMAIL, "ACME_EMAIL");
  if (appDomain === apiDomain) {
    throw new Error("APP_DOMAIN and API_DOMAIN must be different hostnames");
  }
  if (env.TRUST_PROXY_HOPS < 1) {
    throw new Error("TRUST_PROXY_HOPS must be at least 1 when the production API is behind Caddy");
  }

  requireUrlHost(env.API_PUBLIC_URL, "API_PUBLIC_URL", apiDomain);
  requireExactUrl(values.VITE_API_URL, "VITE_API_URL", env.API_PUBLIC_URL);
  requireExactUrl(values.WXT_API_URL, "WXT_API_URL", env.API_PUBLIC_URL);
  requireCorsOrigin(env.CORS_ORIGIN, `https://${appDomain}`);
  const google = validateGoogleEnv(values, env, options);

  return {
    appDomain,
    apiDomain,
    acmeEmail,
    google,
    publicTls: true,
  };
}

function googleVertexAuthMode(env) {
  if (env.GOOGLE_VERTEX_API_KEY) return "api_key";
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return "service_account_adc";
  if (env.GOOGLE_VERTEX_PROJECT || env.GOOGLE_CLOUD_PROJECT) return "ambient_adc";
  return "missing";
}

function connectedSystems(env) {
  return {
    mongodb: {
      enabled: env.AGENT_MEMORY_ENABLED && env.AGENT_MEMORY_BACKEND === "mongodb",
      configured: Boolean(env.AGENT_MEMORY_MCP_HTTP_URL || env.MONGODB_MEMORY_CONNECTION_STRING),
    },
    arize: {
      enabled: env.ARIZE_MCP_ENABLED,
      tracingEnabled: env.PHOENIX_TRACING_ENABLED,
      configured: Boolean(env.PHOENIX_HOST && env.PHOENIX_API_KEY),
    },
    elastic: {
      enabled: env.ELASTIC_MCP_ENABLED,
      configured: Boolean(
        (env.ELASTIC_MCP_HTTP_URL || env.ELASTIC_KIBANA_URL || (env.ELASTIC_MCP_COMMAND && env.ELASTIC_MCP_ARGS)) &&
          (env.ELASTIC_API_KEY || env.ES_API_KEY || (env.ES_USERNAME && env.ES_PASSWORD)),
      ),
      productEvidenceConfigured: Boolean(env.ELASTIC_PRODUCT_INDEX || env.ELASTIC_PRODUCT_SEARCH_TOOL),
    },
    fivetran: {
      enabled: env.FIVETRAN_MCP_ENABLED,
      configured: Boolean(env.FIVETRAN_API_KEY && env.FIVETRAN_API_SECRET),
      writeToolsEnabled: env.FIVETRAN_ALLOW_WRITES,
    },
    gitlab: {
      enabled: env.GITLAB_MCP_ENABLED,
      configured: Boolean(env.GITLAB_PROJECT_ID && env.GITLAB_MCP_AUTH_READY && (env.GITLAB_MCP_HTTP_URL || (env.GITLAB_MCP_COMMAND && env.GITLAB_MCP_ARGS))),
      projectConfigured: Boolean(env.GITLAB_PROJECT_ID),
    },
    dynatrace: {
      enabled: env.DYNATRACE_MCP_ENABLED,
      configured: Boolean(env.DYNATRACE_API_TOKEN && (env.DYNATRACE_MCP_HTTP_URL || env.DYNATRACE_ENVIRONMENT_URL)),
    },
  };
}

function validateGoogleEnv(values, env, options) {
  const apiClientId = env.GOOGLE_CLIENT_ID.trim();
  const webClientId = (values.VITE_GOOGLE_CLIENT_ID ?? "").trim();

  if (!apiClientId && !webClientId) {
    if (options.requireGoogle) {
      throw new Error("GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID are required when --require-google or REQUIRE_GOOGLE=1 is set");
    }
    return {
      required: false,
      configured: false,
    };
  }

  requireGoogleClientId(apiClientId, "GOOGLE_CLIENT_ID");
  requireGoogleClientId(webClientId, "VITE_GOOGLE_CLIENT_ID");
  if (apiClientId !== webClientId) {
    throw new Error("GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_ID must match so the browser-issued ID token audience matches API verification");
  }

  return {
    required: Boolean(options.requireGoogle),
    configured: true,
  };
}

function requireHostname(value, key) {
  const hostname = requireValue(value, key);
  if (hostname.includes("://") || hostname.includes("/") || hostname.includes(":")) {
    throw new Error(`${key} must be a bare hostname without scheme, path, or port`);
  }
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(hostname)
  ) {
    throw new Error(`${key} must be a valid public DNS hostname`);
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error(`${key} must be public for Caddy automatic HTTPS`);
  }
  return hostname.toLowerCase();
}

function requireEmail(value, key) {
  const email = requireValue(value, key);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${key} must be a valid email address for ACME registration`);
  }
  return email;
}

function requireExactUrl(value, key, expected) {
  const actual = requireValue(value, key);
  if (actual !== expected) {
    throw new Error(`${key} must match API_PUBLIC_URL (${expected})`);
  }
  return actual;
}

function requireUrlHost(value, key, expectedHost) {
  const parsed = new URL(requireValue(value, key));
  if (parsed.protocol !== "https:") {
    throw new Error(`${key} must use https:// in production`);
  }
  if (parsed.hostname !== expectedHost) {
    throw new Error(`${key} host must match API_DOMAIN (${expectedHost})`);
  }
}

function requireCorsOrigin(corsOrigin, requiredOrigin) {
  const origins = corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (!origins.includes(requiredOrigin)) {
    throw new Error(`CORS_ORIGIN must include ${requiredOrigin}`);
  }
}

function requireGoogleClientId(value, key) {
  const clientId = requireValue(value, key);
  if (!isGoogleWebClientId(clientId)) {
    throw new Error(`${key} must be a Google OAuth web client ID ending in .apps.googleusercontent.com`);
  }
  return clientId;
}

function requireValue(value, key) {
  if (!value) {
    throw new Error(`${key} is required for production ingress`);
  }
  return value;
}
