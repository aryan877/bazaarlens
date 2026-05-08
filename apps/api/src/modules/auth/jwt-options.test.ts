import { describe, expect, it } from "vitest";
import { buildJwtModuleOptions } from "./jwt-options.js";

describe("buildJwtModuleOptions", () => {
  it("uses the configured JWT secret and access-token lifetime", () => {
    expect(
      buildJwtModuleOptions({
        JWT_SECRET: "test-secret-with-enough-length",
        JWT_EXPIRES_IN: "2h",
      }),
    ).toMatchObject({
      secret: "test-secret-with-enough-length",
      signOptions: {
        expiresIn: "2h",
      },
    });
  });
});
