import { Body, Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBody, ApiConsumes, ApiHeader, ApiOkResponse, ApiProduces, ApiSecurity, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  a2aJsonRpcRequestOpenApiSchema,
  a2aSendMessageRequestOpenApiSchema,
  a2aTaskOpenApiSchema,
  a2aTaskResponseOpenApiSchema,
} from "../../shared/openapi-schemas.js";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe.js";
import { A2aKeyGuard } from "./a2a-key.guard.js";
import {
  A2aJsonRpcRequestSchema,
  A2aSendMessageRequestSchema,
  isSendJsonRpcMethod,
  isTaskCancelJsonRpcMethod,
  isTaskGetJsonRpcMethod,
  isStreamingJsonRpcMethod,
  parseSendMessageParams,
  parseTaskParams,
  taskIdFromParams,
  type A2aJsonRpcRequest,
  type A2aSendMessageRequest,
} from "./a2a.schemas.js";
import { A2aService } from "./a2a.service.js";

@ApiTags("a2a")
@Controller()
export class A2aController {
  constructor(private readonly a2a: A2aService) {}

  @Get(".well-known/agent-card.json")
  agentCard() {
    return this.a2a.agentCard();
  }

  @Get(".well-known/agent.json")
  agentJson() {
    return this.a2a.agentCard();
  }

  @Get("agent-card.json")
  rootAgentCard() {
    return this.a2a.agentCard();
  }

  @Get("agent.json")
  rootAgentJson() {
    return this.a2a.agentCard();
  }

  @Get(".well-known/bazaarlens-submission.json")
  submissionProfile() {
    return this.a2a.submissionProfile();
  }

  @Get("submission.json")
  rootSubmissionProfile() {
    return this.a2a.submissionProfile();
  }

  @Post("a2a/message\\:send")
  @UseGuards(A2aKeyGuard)
  @ApiSecurity("bazaarlensA2aKey")
  @ApiHeader({ name: "x-bazaarlens-a2a-key", required: true })
  @ApiHeader({ name: "A2A-Version", required: false, description: "Optional A2A protocol version. Empty headers are treated as 0.3." })
  @ApiConsumes("application/a2a+json", "application/json")
  @ApiBody({ schema: a2aSendMessageRequestOpenApiSchema })
  @ApiOkResponse({ schema: a2aTaskResponseOpenApiSchema })
  compatibilitySendMessage(@Body(new ZodValidationPipe(A2aSendMessageRequestSchema)) body: A2aSendMessageRequest) {
    return this.a2a.sendMessage(body);
  }

  @Post("message\\:send")
  @UseGuards(A2aKeyGuard)
  @ApiSecurity("bazaarlensA2aKey")
  @ApiHeader({ name: "x-bazaarlens-a2a-key", required: true })
  @ApiHeader({ name: "A2A-Version", required: false, description: "Optional A2A protocol version. Empty headers are treated as 0.3." })
  @ApiConsumes("application/a2a+json", "application/json")
  @ApiBody({ schema: a2aSendMessageRequestOpenApiSchema })
  @ApiOkResponse({ schema: a2aTaskResponseOpenApiSchema })
  sendMessage(@Body(new ZodValidationPipe(A2aSendMessageRequestSchema)) body: A2aSendMessageRequest) {
    return this.a2a.sendMessage(body);
  }

  @Post("v1/message\\:send")
  @UseGuards(A2aKeyGuard)
  @ApiSecurity("bazaarlensA2aKey")
  @ApiHeader({ name: "x-bazaarlens-a2a-key", required: true })
  @ApiHeader({ name: "A2A-Version", required: false, description: "Optional A2A protocol version. Empty headers are treated as 0.3." })
  @ApiConsumes("application/a2a+json", "application/json")
  @ApiBody({ schema: a2aSendMessageRequestOpenApiSchema })
  @ApiOkResponse({ schema: a2aTaskResponseOpenApiSchema })
  versionedSendMessage(@Body(new ZodValidationPipe(A2aSendMessageRequestSchema)) body: A2aSendMessageRequest) {
    return this.a2a.sendMessage(body);
  }

  @Post("a2a/message\\:stream")
  @UseGuards(A2aKeyGuard)
  @ApiSecurity("bazaarlensA2aKey")
  @ApiHeader({ name: "x-bazaarlens-a2a-key", required: true })
  @ApiHeader({ name: "A2A-Version", required: false, description: "Optional A2A protocol version. Empty headers are treated as 0.3." })
  @ApiConsumes("application/a2a+json", "application/json")
  @ApiProduces("text/event-stream")
  @ApiBody({ schema: a2aSendMessageRequestOpenApiSchema })
  async compatibilityStreamMessage(
    @Res() response: Response,
    @Body(new ZodValidationPipe(A2aSendMessageRequestSchema)) body: A2aSendMessageRequest,
  ) {
    const result = await this.a2a.sendMessage(body);
    writeRestSse(response, result.task);
  }

  @Post("message\\:stream")
  @UseGuards(A2aKeyGuard)
  @ApiSecurity("bazaarlensA2aKey")
  @ApiHeader({ name: "x-bazaarlens-a2a-key", required: true })
  @ApiHeader({ name: "A2A-Version", required: false, description: "Optional A2A protocol version. Empty headers are treated as 0.3." })
  @ApiConsumes("application/a2a+json", "application/json")
  @ApiProduces("text/event-stream")
  @ApiBody({ schema: a2aSendMessageRequestOpenApiSchema })
  async streamMessage(@Res() response: Response, @Body(new ZodValidationPipe(A2aSendMessageRequestSchema)) body: A2aSendMessageRequest) {
    const result = await this.a2a.sendMessage(body);
    writeRestSse(response, result.task);
  }

  @Post("v1/message\\:stream")
  @UseGuards(A2aKeyGuard)
  @ApiSecurity("bazaarlensA2aKey")
  @ApiHeader({ name: "x-bazaarlens-a2a-key", required: true })
  @ApiHeader({ name: "A2A-Version", required: false, description: "Optional A2A protocol version. Empty headers are treated as 0.3." })
  @ApiConsumes("application/a2a+json", "application/json")
  @ApiProduces("text/event-stream")
  @ApiBody({ schema: a2aSendMessageRequestOpenApiSchema })
  async versionedStreamMessage(
    @Res() response: Response,
    @Body(new ZodValidationPipe(A2aSendMessageRequestSchema)) body: A2aSendMessageRequest,
  ) {
    const result = await this.a2a.sendMessage(body);
    writeRestSse(response, result.task);
  }

  @Get("v1/tasks/:id")
  @UseGuards(A2aKeyGuard)
  @ApiSecurity("bazaarlensA2aKey")
  @ApiHeader({ name: "x-bazaarlens-a2a-key", required: true })
  @ApiOkResponse({ schema: a2aTaskOpenApiSchema })
  async getTask(@Param("id") id: string, @Query("historyLength") historyLength: string | undefined) {
    const task = await this.a2a.getTask(id, historyLength ? Number(historyLength) : undefined);
    return task ?? taskNotFoundResponse(id);
  }

  @Post("v1/tasks/:id\\:cancel")
  @UseGuards(A2aKeyGuard)
  @ApiSecurity("bazaarlensA2aKey")
  @ApiHeader({ name: "x-bazaarlens-a2a-key", required: true })
  @ApiOkResponse({ schema: a2aTaskOpenApiSchema })
  async cancelTask(@Param("id") id: string) {
    return (await this.a2a.cancelTask(id)) ?? taskNotFoundResponse(id);
  }

  @Post("a2a")
  @UseGuards(A2aKeyGuard)
  @ApiSecurity("bazaarlensA2aKey")
  @ApiHeader({ name: "x-bazaarlens-a2a-key", required: true })
  @ApiHeader({ name: "A2A-Version", required: false, description: "Optional A2A protocol version. Empty headers are treated as 0.3." })
  @ApiConsumes("application/json", "application/a2a+json")
  @ApiProduces("application/json", "text/event-stream")
  @ApiBody({ schema: a2aJsonRpcRequestOpenApiSchema })
  @ApiOkResponse({ schema: { type: "object", properties: { jsonrpc: { type: "string" }, id: {}, result: a2aTaskOpenApiSchema } } })
  async jsonRpc(
    @Headers("a2a-version") _a2aVersion: string | undefined,
    @Res({ passthrough: true }) response: Response,
    @Body(new ZodValidationPipe(A2aJsonRpcRequestSchema)) body: A2aJsonRpcRequest,
  ) {
    if (isSendJsonRpcMethod(body.method)) {
      let params: A2aSendMessageRequest;
      try {
        params = parseSendMessageParams(body.params);
      } catch (error) {
        return jsonRpcInvalidParams(body.id ?? null, error);
      }
      const result = await this.a2a.sendMessage(params);
      if (isStreamingJsonRpcMethod(body.method)) {
        writeJsonRpcSse(response, body.id ?? null, result.task);
        return;
      }

      return {
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: result.task,
      };
    }

    if (!isTaskGetJsonRpcMethod(body.method) && !isTaskCancelJsonRpcMethod(body.method)) {
      return jsonRpcMethodNotFound(body.id ?? null, body.method);
    }

    let taskParams: ReturnType<typeof parseTaskParams>;
    try {
      taskParams = parseTaskParams(body.params);
    } catch (error) {
      return jsonRpcInvalidParams(body.id ?? null, error);
    }
    const taskId = taskIdFromParams(taskParams);
    if (isTaskGetJsonRpcMethod(body.method)) {
      const task = await this.a2a.getTask(taskId, taskParams.historyLength);
      if (!task) return jsonRpcTaskNotFound(body.id ?? null, taskId);
      return {
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: task,
      };
    }

    if (isTaskCancelJsonRpcMethod(body.method)) {
      const task = await this.a2a.cancelTask(taskId);
      if (!task) return jsonRpcTaskNotFound(body.id ?? null, taskId);
      return {
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: task,
      };
    }

    return jsonRpcMethodNotFound(body.id ?? null, body.method);
  }
}

function writeRestSse(response: Response, task: A2aTask) {
  openSse(response);
  writeSse(response, { task });
  writeSse(response, { statusUpdate: statusUpdateForTask(task) });
  response.end();
}

function writeJsonRpcSse(response: Response, id: A2aJsonRpcRequest["id"] | null, task: A2aTask) {
  openSse(response);
  writeSse(response, { jsonrpc: "2.0", id, result: task });
  writeSse(response, { jsonrpc: "2.0", id, result: statusUpdateForTask(task) });
  response.end();
}

function openSse(response: Response) {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();
}

function statusUpdateForTask(task: A2aTask) {
  return {
    taskId: task.id,
    contextId: task.contextId,
    status: task.status,
    final: true,
    kind: "status-update",
  };
}

function jsonRpcTaskNotFound(id: A2aJsonRpcRequest["id"] | null, taskId: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32001,
      message: "Task not found",
      data: { taskId },
    },
  };
}

function jsonRpcMethodNotFound(id: A2aJsonRpcRequest["id"] | null, method: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: "Method not found",
      data: { method },
    },
  };
}

function jsonRpcInvalidParams(id: A2aJsonRpcRequest["id"] | null, error: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: -32602,
      message: "Invalid params",
      data: {
        issues: zodIssues(error),
      },
    },
  };
}

function zodIssues(error: unknown) {
  if (!error || typeof error !== "object" || !("issues" in error) || !Array.isArray((error as { issues?: unknown }).issues)) {
    return undefined;
  }
  return (error as { issues: Array<{ path?: unknown; message?: unknown }> }).issues.map((issue) => ({
    path: Array.isArray(issue.path) ? issue.path.join(".") : "",
    message: typeof issue.message === "string" ? issue.message : "Invalid value",
  }));
}

function taskNotFoundResponse(taskId: string) {
  return {
    id: taskId,
    contextId: taskId,
    status: {
      state: "failed",
      timestamp: new Date().toISOString(),
    },
    kind: "task",
    metadata: {
      error: "task_not_found",
    },
  };
}

function writeSse(response: Response, payload: unknown) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

type A2aTask = {
  id: string;
  contextId: string;
  status: unknown;
  kind: string;
};
