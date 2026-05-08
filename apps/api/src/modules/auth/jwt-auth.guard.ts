import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { z } from "zod";

const JwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException("Missing bearer token");

    try {
      const payload = JwtPayloadSchema.parse(await this.jwt.verifyAsync(token));
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch (error) {
      if (isTokenExpired(error)) {
        throw new UnauthorizedException("Bearer token expired");
      }
      throw new UnauthorizedException("Invalid bearer token");
    }
  }
}

function extractBearerToken(header: string | undefined): string | null {
  const [type, token] = header?.split(" ") ?? [];
  return type?.toLowerCase() === "bearer" && token ? token : null;
}

function isTokenExpired(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "TokenExpiredError";
}
