import { describe, expect, it } from "vitest";
import {
  createCloudflareDnsPlan,
  expectedCloudflareRecordNames,
  parseCloudflareDnsOptions,
  validateCloudflareDnsState,
} from "./lib/cloudflare-dns.mjs";

describe("Cloudflare DNS helper", () => {
  it("keeps the BazaarLens DNS contract small and env-driven", () => {
    const options = parseCloudflareDnsOptions(["--env-file", "/tmp/bazaarlens-missing-env-file"], {
      CLOUDFLARE_API_TOKEN: "test-token",
    });
    const plan = createCloudflareDnsPlan(options);

    expect(options.targetIp).toBe("");
    expect(plan.verifyTokenUrl).toBe("https://api.cloudflare.com/client/v4/user/tokens/verify");
    expect(expectedCloudflareRecordNames("bazaarlens.xyz")).toEqual([
      "bazaarlens.xyz",
      "www.bazaarlens.xyz",
      "api.bazaarlens.xyz",
    ]);
  });

  it("validates required DNS-only A records without a hardcoded IP", () => {
    const names = expectedCloudflareRecordNames("bazaarlens.xyz");
    const validation = validateCloudflareDnsState({
      tokenStatus: "active",
      zone: { id: "zone123", status: "active" },
      records: names.map((name) => ({ name, type: "A", content: "203.0.113.10", proxied: false })),
      publicDns: Object.fromEntries(names.map((name) => [name, ["203.0.113.10"]])),
      expectedNames: names,
      targetIp: "",
    });

    expect(validation).toMatchObject({ ok: true, problems: [] });
  });
});
