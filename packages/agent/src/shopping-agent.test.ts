import { afterEach, describe, expect, it, vi } from "vitest";
import { extractJson, resolveVertexConfig, ShoppingAgent } from "./shopping-agent.js";

const page = {
  url: "https://www.amazon.in/example/dp/B000000",
  merchant: "amazon" as const,
  title: "NoiseFit Smart Watch",
  price: { amount: 2499, currency: "INR" as const, raw: "₹2,499" },
  mrp: null,
  discountText: "50% off",
  rating: 4.2,
  reviewCount: 1200,
  seller: "RetailNet",
  availability: "In stock",
  delivery: "Tomorrow",
  returnPolicy: "7 days replacement",
  selectedSize: null,
  images: [],
  breadcrumbs: ["Electronics", "Wearables"],
  visibleText: "In stock 7 days replacement",
  extractedAt: new Date("2026-06-09T00:00:00.000Z").toISOString(),
};

describe("ShoppingAgent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("extracts fenced json", () => {
    expect(extractJson("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
  });

  it("resolves Google Vertex settings from explicit options first", () => {
    vi.stubEnv("GOOGLE_VERTEX_API_KEY", "env-key");
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "env-project");
    vi.stubEnv("GOOGLE_VERTEX_LOCATION", "us-central1");
    vi.stubEnv("GOOGLE_VERTEX_MODEL", "gemini-3-pro-preview");

    expect(
      resolveVertexConfig({
        vertexApiKey: " option-key ",
        vertexProject: " option-project ",
        vertexLocation: " asia-south1 ",
        model: " gemini-3.5-flash ",
      }),
    ).toEqual({
      apiKey: "option-key",
      project: "option-project",
      location: "asia-south1",
      model: "gemini-3.5-flash",
    });
  });

  it("falls back to Google Cloud project env for ADC deployments", () => {
    vi.stubEnv("GOOGLE_VERTEX_API_KEY", "");
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "cloud-run-project");
    vi.stubEnv("GOOGLE_VERTEX_LOCATION", "global");
    vi.stubEnv("GOOGLE_VERTEX_MODEL", "gemini-3.5-flash");

    expect(resolveVertexConfig()).toEqual({
      apiKey: undefined,
      project: "cloud-run-project",
      location: "global",
      model: "gemini-3.5-flash",
    });
  });

  it("requires Google Cloud Gemini configuration", async () => {
    vi.stubEnv("GOOGLE_VERTEX_API_KEY", "");
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "");
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");

    const agent = new ShoppingAgent();
    await expect(
      agent.analyze({ page, intent: { query: "Should I buy?", budget: null, userContext: null } }),
    ).rejects.toThrow("GOOGLE_VERTEX_API_KEY");
  });
});
