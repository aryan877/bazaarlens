import { afterEach, describe, expect, it, vi } from "vitest";
import { history } from "./api";

describe("extension API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads authenticated decision history", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify([
          {
            id: "9d273ad2-4a52-4f15-bc4d-5409f208741f",
            createdAt: "2026-06-09T05:30:00.000Z",
            merchant: "amazon",
            title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
            url: "https://www.amazon.in/example/dp/B000000",
            verdict: "buy",
            summary: "Good seller and price, with return caveats.",
            approvedAction: "add_to_cart",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const items = await history("http://localhost:8787", "token-123");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8787/agent/history", {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-123",
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.approvedAction).toBe("add_to_cart");
  });

  it("includes status and body when a request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })),
    );

    await expect(history("http://localhost:8787", "bad-token")).rejects.toThrow("401: Unauthorized");
  });
});
