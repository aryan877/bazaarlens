import { describe, expect, it } from "vitest";
import {
  A2aJsonRpcRequestSchema,
  isTaskCancelJsonRpcMethod,
  isTaskGetJsonRpcMethod,
  parseTaskParams,
  taskIdFromParams,
} from "./a2a.schemas.js";

describe("A2A schemas", () => {
  it("accepts current and compatibility JSON-RPC send-message method names", () => {
    for (const method of ["SendMessage", "message/send", "message:send", "SendStreamingMessage", "message/stream", "message:stream"]) {
      expect(
        A2aJsonRpcRequestSchema.parse({
          jsonrpc: "2.0",
          id: "request-1",
          method,
          params: {
            message: {
              role: "ROLE_USER",
              messageId: "msg-1",
              parts: [{ text: "structured payload required", mediaType: "text/plain" }],
            },
          },
        }).method,
      ).toBe(method);
    }
  });

  it("accepts task get and cancel method names with task identifiers", () => {
    const get = A2aJsonRpcRequestSchema.parse({
      jsonrpc: "2.0",
      id: "request-2",
      method: "tasks/get",
      params: {
        name: "tasks/4a44b220-a577-4502-bc7d-ab789f90429d",
        historyLength: 1,
      },
    });
    const cancel = A2aJsonRpcRequestSchema.parse({
      jsonrpc: "2.0",
      id: "request-3",
      method: "tasks/cancel",
      params: {
        id: "4a44b220-a577-4502-bc7d-ab789f90429d",
      },
    });

    expect(isTaskGetJsonRpcMethod(get.method)).toBe(true);
    expect(isTaskCancelJsonRpcMethod(cancel.method)).toBe(true);
    expect(taskIdFromParams(parseTaskParams(get.params))).toBe("4a44b220-a577-4502-bc7d-ab789f90429d");
    expect(taskIdFromParams(parseTaskParams(cancel.params))).toBe("4a44b220-a577-4502-bc7d-ab789f90429d");
  });

  it("accepts unknown JSON-RPC method names so the controller can return method-not-found", () => {
    expect(
      A2aJsonRpcRequestSchema.parse({
        jsonrpc: "2.0",
        id: "request-4",
        method: "tasks/unknown",
        params: {},
      }).method,
    ).toBe("tasks/unknown");
  });
});
