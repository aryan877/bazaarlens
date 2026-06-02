import { describe, expect, it } from "vitest";
import { createLiveReadinessPlan } from "./live-readiness.mjs";

const baseEnv = {
  WXT_API_URL: "https://api.bazaarlens.xyz",
  CORS_ORIGIN: "https://bazaarlens.xyz,https://www.bazaarlens.xyz",
};

describe("live readiness plan", () => {
  it("runs public web and A2A smoke checks by default", () => {
    const plan = createLiveReadinessPlan({
      envPath: "deploy/production.env",
      env: baseEnv,
      requireGoogle: true,
      skipDockerBuild: true,
      skipLiveSmoke: false,
    });

    expect(plan.apiUrl).toBe("https://api.bazaarlens.xyz");
    expect(plan.webUrl).toBe("https://bazaarlens.xyz");
    expect(plan.steps.map((step) => step.name)).toEqual(
      expect.arrayContaining(["live web/API smoke", "live A2A submission smoke"]),
    );
    expect(plan.steps.find((step) => step.name === "live web/API smoke")).toMatchObject({
      command: ["pnpm", "smoke:live:web"],
      env: {
        WEB_URL: "https://bazaarlens.xyz",
        API_URL: "https://api.bazaarlens.xyz",
        REQUIRE_GOOGLE: "1",
      },
    });
    expect(plan.steps.find((step) => step.name === "live A2A submission smoke")).toMatchObject({
      command: ["pnpm", "smoke:a2a"],
      env: { API_URL: "https://api.bazaarlens.xyz" },
    });
    expect(plan.steps.some((step) => step.name === "production docker images")).toBe(false);
  });

  it("can skip live smoke for build/package-only checks", () => {
    const plan = createLiveReadinessPlan({
      envPath: "deploy/production.env",
      env: baseEnv,
      skipDockerBuild: false,
      skipLiveSmoke: true,
    });

    expect(plan.steps.some((step) => step.name === "production docker images")).toBe(true);
    expect(plan.steps.some((step) => step.name === "live web/API smoke")).toBe(false);
    expect(plan.steps.some((step) => step.name === "live A2A submission smoke")).toBe(false);
  });
});
