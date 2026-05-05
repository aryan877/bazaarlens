export interface ParsedPrice {
  readonly amount: number;
  readonly currency: "INR" | "USD" | "UNKNOWN";
  readonly raw: string;
}

const PRICE_RE = /(?:₹|INR|Rs\.?|USD|\$)?\s*([0-9][0-9,\s]*(?:\.[0-9]{1,2})?)/i;

export function parsePrice(raw: string | null | undefined): ParsedPrice | null {
  if (!raw) return null;
  const normalized = raw.replace(/\u00a0/g, " ").trim();
  const match = normalized.match(PRICE_RE);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace(/[,\s]/g, ""));
  if (!Number.isFinite(amount)) return null;
  const currency = normalized.includes("$")
    ? "USD"
    : /₹|INR|Rs\.?/i.test(normalized)
      ? "INR"
      : "UNKNOWN";
  return { amount, currency, raw: normalized };
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
