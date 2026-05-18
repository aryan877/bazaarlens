import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";
import { A2aKeyGuard } from "./a2a-key.guard.js";

const originalEnv = { ...process.env };

describe("A2aKeyGuard", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("accepts the configured A2A header key", () => {
    process.env = envWithA2aKey("a-32-plus-character-a2a-agent-key");

    expect(
      new A2aKeyGuard().canActivate(
        contextFor({
          "x-bazaarlens-a2a-key": "a-32-plus-character-a2a-agent-key",
        }),
      ),
    ).toBe(true);
  });

  it("accepts bearer token form for platforms that use Authorization", () => {
    process.env = envWithA2aKey("a-32-plus-character-a2a-agent-key");

    expect(
      new A2aKeyGuard().canActivate(
        contextFor({
          authorization: "Bearer a-32-plus-character-a2a-agent-key",
        }),
      ),
    ).toBe(true);
  });

  it("rejects missing or wrong A2A keys", () => {
    process.env = envWithA2aKey("a-32-plus-character-a2a-agent-key");

    expect(() => new A2aKeyGuard().canActivate(contextFor({}))).toThrow(UnauthorizedException);
    expect(() =>
      new A2aKeyGuard().canActivate(
        contextFor({
          "x-bazaarlens-a2a-key": "wrong-key",
        }),
      ),
    ).toThrow(UnauthorizedException);
  });
});

function envWithA2aKey(a2aKey: string): NodeJS.ProcessEnv {
  return {
    ...originalEnv,
    NODE_ENV: "development",
    API_PUBLIC_URL: "http://localhost:8787",
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://bazaarlens:bazaarlens@localhost:5438/bazaarlens?schema=public",
    JWT_SECRET: "replace-with-a-strong-dev-secret",
    A2A_AGENT_KEY: a2aKey,
  };
}

function contextFor(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}
