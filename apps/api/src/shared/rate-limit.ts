import type { ExecutionContext } from "@nestjs/common";
import { seconds, type ThrottlerModuleOptions } from "@nestjs/throttler";
import type { Env } from "./env.js";

type ControllerEndpoint =
  | "AuthController.register"
  | "AuthController.login"
  | "AuthController.google"
  | "AuthController.startExtensionAuth"
  | "AuthController.completeExtensionAuth"
  | "AuthController.pollExtensionAuth"
  | "AgentController.analyze"
  | "AgentController.approval";

const AUTH_ENDPOINTS = [
  "AuthController.register",
  "AuthController.login",
  "AuthController.google",
  "AuthController.startExtensionAuth",
  "AuthController.completeExtensionAuth",
  "AuthController.pollExtensionAuth",
] satisfies ControllerEndpoint[];

const AGENT_ANALYZE_ENDPOINTS = ["AgentController.analyze"] satisfies ControllerEndpoint[];
const AGENT_APPROVAL_ENDPOINTS = ["AgentController.approval"] satisfies ControllerEndpoint[];

export function buildThrottlerOptions(env: Env): ThrottlerModuleOptions {
  return {
    errorMessage: "Too many requests. Please wait before retrying.",
    throttlers: [
      {
        name: "default",
        ttl: seconds(env.RATE_LIMIT_DEFAULT_TTL_SECONDS),
        limit: env.RATE_LIMIT_DEFAULT_LIMIT,
      },
      {
        name: "auth",
        ttl: seconds(env.RATE_LIMIT_AUTH_TTL_SECONDS),
        limit: env.RATE_LIMIT_AUTH_LIMIT,
        skipIf: skipUnlessEndpoints(AUTH_ENDPOINTS),
      },
      {
        name: "agentAnalyze",
        ttl: seconds(env.RATE_LIMIT_AGENT_ANALYZE_TTL_SECONDS),
        limit: env.RATE_LIMIT_AGENT_ANALYZE_LIMIT,
        skipIf: skipUnlessEndpoints(AGENT_ANALYZE_ENDPOINTS),
      },
      {
        name: "agentApproval",
        ttl: seconds(env.RATE_LIMIT_AGENT_APPROVAL_TTL_SECONDS),
        limit: env.RATE_LIMIT_AGENT_APPROVAL_LIMIT,
        skipIf: skipUnlessEndpoints(AGENT_APPROVAL_ENDPOINTS),
      },
    ],
  };
}

function skipUnlessEndpoints(endpoints: readonly ControllerEndpoint[]) {
  const allowed = new Set<string>(endpoints);
  return (context: ExecutionContext) => !allowed.has(getEndpointId(context));
}

function getEndpointId(context: ExecutionContext): string {
  return `${context.getClass().name}.${context.getHandler().name}`;
}
