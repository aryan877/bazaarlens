import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface CurrentUser {
  readonly id: string;
  readonly email: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user?: CurrentUser }>();
  return request.user;
});
