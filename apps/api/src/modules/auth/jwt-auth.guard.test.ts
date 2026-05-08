import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

describe("JwtAuthGuard", () => {
  it("attaches a verified bearer token user to the request", async () => {
    const request = requestFor("Bearer token");
    const jwt = {
      verifyAsync: vi.fn(async () => ({
        sub: "4a44b220-a577-4502-bc7d-ab789f90429d",
        email: "shopper@example.com",
      })),
    };

    await expect(new JwtAuthGuard(jwt as unknown as JwtService).canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.user).toEqual({
      id: "4a44b220-a577-4502-bc7d-ab789f90429d",
      email: "shopper@example.com",
    });
  });

  it("returns a specific unauthorized error for expired bearer tokens", async () => {
    const jwt = {
      verifyAsync: vi.fn(async () => {
        const error = new Error("jwt expired");
        error.name = "TokenExpiredError";
        throw error;
      }),
    };

    await expect(
      new JwtAuthGuard(jwt as unknown as JwtService).canActivate(contextFor(requestFor("Bearer expired"))),
    ).rejects.toMatchObject({
      response: {
        message: "Bearer token expired",
      },
    });
  });

  it("rejects missing bearer tokens", async () => {
    const jwt = { verifyAsync: vi.fn() };

    await expect(
      new JwtAuthGuard(jwt as unknown as JwtService).canActivate(contextFor(requestFor(undefined))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });
});

function requestFor(authorization: string | undefined) {
  return {
    headers: { authorization },
    user: undefined,
  };
}

function contextFor(request: ReturnType<typeof requestFor>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
