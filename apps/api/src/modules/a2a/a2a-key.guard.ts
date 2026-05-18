import { timingSafeEqual } from "node:crypto";
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { getEnv } from "../../shared/env.js";

@Injectable()
export class A2aKeyGuard implements CanActivate {
  private readonly env = getEnv();

  canActivate(context: ExecutionContext): boolean {
    if (!this.env.A2A_AGENT_KEY) {
      throw new UnauthorizedException("A2A agent key is not configured");
    }

    const request = context.switchToHttp().getRequest<Request>();
    const supplied = headerValue(request.headers["x-bazaarlens-a2a-key"]) ?? bearerToken(request.headers.authorization);
    if (!supplied || !constantTimeEqual(supplied, this.env.A2A_AGENT_KEY)) {
      throw new UnauthorizedException("Invalid A2A agent key");
    }

    return true;
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function bearerToken(value: string | undefined): string | null {
  const [type, token] = value?.split(" ") ?? [];
  return type?.toLowerCase() === "bearer" && token ? token : null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
