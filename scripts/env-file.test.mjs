import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getEnvPath, hasFlag, parseEnvFile } from "./lib/env-file.mjs";

const originalEnv = { ...process.env };

describe("env file helpers", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("parses simple dotenv values without leaking comments", () => {
    expect(
      parseEnvFile(`
        # ignored
        API_PUBLIC_URL=https://api.bazaarlens.xyz
        JWT_SECRET="quoted secret"
        EMPTY=
      `),
    ).toEqual({
      API_PUBLIC_URL: "https://api.bazaarlens.xyz",
      JWT_SECRET: "quoted secret",
      EMPTY: "",
    });
  });

  it("ignores known flags when resolving an explicit env path", () => {
    expect(
      getEnvPath(["--require-google", "--skip-live-smoke", "deploy/production.env"], null, {
        ignoredFlags: ["--require-google", "--skip-live-smoke"],
      }),
    ).toBe(resolve("deploy/production.env"));
  });

  it("falls back to BAZAARLENS_ENV_FILE after ignored flags", () => {
    process.env = { ...originalEnv, BAZAARLENS_ENV_FILE: "deploy/from-env.env" };

    expect(getEnvPath(["--require-google"], null, { ignoredFlags: ["--require-google"] })).toBe(
      resolve("deploy/from-env.env"),
    );
  });

  it("detects boolean flags", () => {
    expect(hasFlag(["--require-google"], "--require-google")).toBe(true);
    expect(hasFlag(["deploy/production.env"], "--require-google")).toBe(false);
  });
});
