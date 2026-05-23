import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ApprovalRequest,
  ApprovalResponse,
  ExtensionAuthPollResponse,
  ExtensionAuthStartResponse,
  HistoryItem,
} from "@bazaarlens/shared";

export async function apiRequest<T>(
  apiUrl: string,
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, ...requestOptions } = options;
  const response = await fetch(`${apiUrl}${path}`, {
    ...requestOptions,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${body || response.statusText}`);
  }
  return (await response.json()) as T;
}

export function startExtensionAuth(apiUrl: string): Promise<ExtensionAuthStartResponse> {
  return apiRequest(apiUrl, "/auth/extension/start", {
    method: "POST",
  });
}

export function pollExtensionAuth(
  apiUrl: string,
  flowId: string,
  pollToken: string,
): Promise<ExtensionAuthPollResponse> {
  return apiRequest(apiUrl, "/auth/extension/poll", {
    method: "POST",
    body: JSON.stringify({ flowId, pollToken }),
  });
}

export function analyze(apiUrl: string, token: string, body: AnalyzeRequest): Promise<AnalyzeResponse> {
  return apiRequest(apiUrl, "/agent/analyze", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function approve(apiUrl: string, token: string, body: ApprovalRequest): Promise<ApprovalResponse> {
  return apiRequest(apiUrl, "/agent/approval", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function history(apiUrl: string, token: string): Promise<HistoryItem[]> {
  return apiRequest(apiUrl, "/agent/history", { token });
}
