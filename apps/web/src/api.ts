import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ApprovalRequest,
  ApprovalResponse,
  AuthResponse,
  ExtensionAuthDetailsResponse,
  HistoryItem,
  McpCapabilitiesResponse,
} from "@bazaarlens/shared";
import { getApiUrl } from "./runtime-config";

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...requestOptions } = options;
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...requestOptions,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export function register(email: string, password: string): Promise<AuthResponse> {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: email.split("@")[0] }),
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function googleLogin(idToken: string): Promise<AuthResponse> {
  return apiRequest("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}

export function extensionAuthDetails(flowId: string): Promise<ExtensionAuthDetailsResponse> {
  return apiRequest(`/auth/extension/${encodeURIComponent(flowId)}`);
}

export function completeExtensionAuth(token: string, flowId: string): Promise<ExtensionAuthDetailsResponse> {
  return apiRequest("/auth/extension/complete", {
    method: "POST",
    token,
    body: JSON.stringify({ flowId }),
  });
}

export function analyze(token: string, body: AnalyzeRequest): Promise<AnalyzeResponse> {
  return apiRequest("/agent/analyze", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function approve(token: string, body: ApprovalRequest): Promise<ApprovalResponse> {
  return apiRequest("/agent/approval", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function history(token: string): Promise<HistoryItem[]> {
  return apiRequest("/agent/history", { token });
}

export function mcpCapabilities(token: string, verify = false): Promise<McpCapabilitiesResponse> {
  return apiRequest(`/ops/capabilities${verify ? "?verify=true" : ""}`, { token });
}
