import { describe, expect, it } from "vitest";
import { parsePrice } from "./price.js";

describe("parsePrice", () => {
  it("parses Indian rupee strings with separators", () => {
    expect(parsePrice("₹1,24,999")).toEqual({
      amount: 124999,
      currency: "INR",
      raw: "₹1,24,999",
    });
  });

  it("returns null for missing prices", () => {
    expect(parsePrice("Currently unavailable")).toBeNull();
  });
});
