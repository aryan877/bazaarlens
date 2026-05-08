import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/zod-validation.pipe.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser, type CurrentUser as CurrentUserShape } from "./current-user.decorator.js";
import {
  ExtensionAuthCompleteSchema,
  ExtensionAuthFlowIdSchema,
  ExtensionAuthPollSchema,
  GoogleLoginSchema,
  LoginSchema,
  RegisterSchema,
  type ExtensionAuthCompleteInput,
  type ExtensionAuthPollInput,
  type GoogleLoginInput,
  type LoginInput,
  type RegisterInput,
} from "./auth.schemas.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body(new ZodValidationPipe(RegisterSchema)) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Post("login")
  login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginInput) {
    return this.auth.login(body);
  }

  @Post("google")
  google(@Body(new ZodValidationPipe(GoogleLoginSchema)) body: GoogleLoginInput) {
    return this.auth.googleLogin(body);
  }

  @Post("extension/start")
  startExtensionAuth() {
    return this.auth.startExtensionAuth();
  }

  @Get("extension/:flowId")
  extensionAuthDetails(@Param("flowId", new ZodValidationPipe(ExtensionAuthFlowIdSchema)) flowId: string) {
    return this.auth.extensionAuthDetails(flowId);
  }

  @Post("extension/complete")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  completeExtensionAuth(
    @CurrentUser() user: CurrentUserShape,
    @Body(new ZodValidationPipe(ExtensionAuthCompleteSchema)) body: ExtensionAuthCompleteInput,
  ) {
    return this.auth.completeExtensionAuth(user.id, body);
  }

  @Post("extension/poll")
  pollExtensionAuth(@Body(new ZodValidationPipe(ExtensionAuthPollSchema)) body: ExtensionAuthPollInput) {
    return this.auth.pollExtensionAuth(body);
  }

  @Get("me")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: CurrentUserShape) {
    return this.auth.me(user.id);
  }
}
