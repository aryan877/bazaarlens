import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  AnalyzeRequestSchema,
  ApprovalRequestSchema,
  type AnalyzeRequest,
  type ApprovalRequest,
} from "@bazaarlens/shared";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe.js";
import {
  analyzeRequestOpenApiSchema,
  analyzeResponseOpenApiSchema,
  approvalRequestOpenApiSchema,
  approvalResponseOpenApiSchema,
} from "../../shared/openapi-schemas.js";
import { CurrentUser, type CurrentUser as CurrentUserShape } from "../auth/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/jwt-auth.guard.js";
import { AgentService } from "./agent.service.js";

@ApiTags("agent")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("agent")
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post("analyze")
  @ApiBody({ schema: analyzeRequestOpenApiSchema })
  @ApiOkResponse({ schema: analyzeResponseOpenApiSchema })
  analyze(
    @CurrentUser() user: CurrentUserShape,
    @Body(new ZodValidationPipe(AnalyzeRequestSchema)) body: AnalyzeRequest,
  ) {
    return this.agent.analyze(user.id, body);
  }

  @Post("approval")
  @ApiBody({ schema: approvalRequestOpenApiSchema })
  @ApiOkResponse({ schema: approvalResponseOpenApiSchema })
  approval(
    @CurrentUser() user: CurrentUserShape,
    @Body(new ZodValidationPipe(ApprovalRequestSchema)) body: ApprovalRequest,
  ) {
    return this.agent.approve(user.id, body);
  }

  @Get("history")
  history(@CurrentUser() user: CurrentUserShape) {
    return this.agent.history(user.id);
  }
}
