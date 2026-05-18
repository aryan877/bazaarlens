import { z } from "zod";
import { AnalyzeRequestSchema } from "@bazaarlens/shared";

const PartSchema = z.object({
  kind: z.enum(["text", "data", "file"]).optional(),
  text: z.string().optional(),
  data: z.unknown().optional(),
  raw: z.string().optional(),
  url: z.string().url().optional(),
  mediaType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => ["text", "data", "raw", "url"].filter((key) => key in value).length === 1, {
  message: "Each A2A part must contain exactly one of text, data, raw, or url",
});

const MessageSchema = z.object({
  kind: z.literal("message").optional(),
  messageId: z.string().min(1).optional(),
  contextId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  role: z.enum(["ROLE_USER", "ROLE_AGENT", "user", "agent"]).default("ROLE_USER"),
  parts: z.array(PartSchema).min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const A2aSendMessageRequestSchema = z.object({
  tenant: z.string().optional(),
  message: MessageSchema,
  configuration: z
    .object({
      acceptedOutputModes: z.array(z.string()).optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type A2aSendMessageRequest = z.infer<typeof A2aSendMessageRequestSchema>;

const TaskParamsSchema = z.object({
  id: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  historyLength: z.coerce.number().int().min(0).max(50).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => value.id || value.taskId || value.name, {
  message: "Task params must include id, taskId, or name",
});
export type A2aTaskParams = z.infer<typeof TaskParamsSchema>;

const MessageMethodSchema = z.enum(["SendMessage", "message/send", "message:send", "SendStreamingMessage", "message/stream", "message:stream"]);
const TaskMethodSchema = z.enum(["GetTask", "tasks/get", "CancelTask", "tasks/cancel"]);

export const A2aJsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.unknown(),
});
export type A2aJsonRpcRequest = z.infer<typeof A2aJsonRpcRequestSchema>;

export function isStreamingJsonRpcMethod(method: A2aJsonRpcRequest["method"]): boolean {
  return method === "SendStreamingMessage" || method === "message/stream" || method === "message:stream";
}

export function isSendJsonRpcMethod(method: A2aJsonRpcRequest["method"]): boolean {
  return MessageMethodSchema.safeParse(method).success;
}

export function isTaskGetJsonRpcMethod(method: A2aJsonRpcRequest["method"]): boolean {
  return method === "GetTask" || method === "tasks/get";
}

export function isTaskCancelJsonRpcMethod(method: A2aJsonRpcRequest["method"]): boolean {
  return method === "CancelTask" || method === "tasks/cancel";
}

export function parseSendMessageParams(params: unknown): A2aSendMessageRequest {
  return A2aSendMessageRequestSchema.parse(params);
}

export function parseTaskParams(params: unknown): A2aTaskParams {
  return TaskParamsSchema.parse(params);
}

export function taskIdFromParams(params: A2aTaskParams): string {
  if (params.id) return params.id;
  if (params.taskId) return params.taskId;
  const name = params.name ?? "";
  return name.split("/").filter(Boolean).at(-1) ?? name;
}

export function extractAnalyzeRequest(input: A2aSendMessageRequest) {
  const candidates = [
    input.metadata?.analyzeRequest,
    input.message.metadata?.analyzeRequest,
    ...input.message.parts.map((part) => part.data),
    ...input.message.parts.flatMap((part) => (part.text ? parsePossibleJson(part.text) : [])),
  ];

  for (const candidate of candidates) {
    const parsed = AnalyzeRequestSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }

  return null;
}

function parsePossibleJson(value: string): unknown[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return [];
  try {
    return [JSON.parse(trimmed)];
  } catch {
    return [];
  }
}
