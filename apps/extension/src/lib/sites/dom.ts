export type JsonObject = Record<string, unknown>;

export function firstText(doc: Document, selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    const node = doc.querySelector<HTMLElement>(selector);
    const value = clean(node?.innerText || node?.textContent || node?.getAttribute("content") || "");
    if (value) return value;
  }
  return null;
}

export function firstMeta(doc: Document, keys: readonly string[]): string | null {
  for (const key of keys) {
    const escaped = cssString(key);
    const node = doc.querySelector<HTMLMetaElement>(
      `meta[property="${escaped}"], meta[name="${escaped}"], meta[itemprop="${escaped}"]`,
    );
    const value = clean(node?.content || "");
    if (value) return value;
  }
  return null;
}

export function collectTexts(doc: Document, selectors: readonly string[]): string[] {
  return unique(
    selectors.flatMap((selector) =>
      Array.from(doc.querySelectorAll<HTMLElement>(selector))
        .map((node) => clean(node.innerText || node.textContent || ""))
        .filter(Boolean),
    ),
  );
}

export function collectImages(doc: Document, selectors: readonly string[] = ["img"]): string[] {
  const selected = selectors.flatMap((selector) => Array.from(doc.querySelectorAll<HTMLImageElement>(selector)));
  const fallback = doc.images ? Array.from(doc.images) : [];
  const urls = [...selected, ...fallback]
    .map((img) => img.currentSrc || img.src || img.getAttribute("data-src") || img.getAttribute("data-old-hires") || "")
    .filter((src) => /^https?:\/\//.test(src))
    .slice(0, 24);
  return unique(urls).slice(0, 12);
}

export function firstJsonLdProduct(doc: Document): JsonObject | null {
  for (const script of Array.from(doc.querySelectorAll<HTMLScriptElement>("script[type='application/ld+json']"))) {
    const text = script.textContent?.trim();
    if (!text) continue;
    try {
      const products = collectProductNodes(JSON.parse(text));
      if (products[0]) return products[0];
    } catch {
      continue;
    }
  }
  return null;
}

export function firstJsonAssignment(doc: Document, marker: string): JsonObject | null {
  for (const script of Array.from(doc.scripts)) {
    const text = script.textContent || "";
    const markerIndex = text.indexOf(marker);
    if (markerIndex < 0) continue;
    const objectStart = text.indexOf("{", markerIndex + marker.length);
    if (objectStart < 0) continue;
    const slice = balancedJsonObject(text, objectStart);
    if (!slice) continue;
    try {
      const parsed = JSON.parse(slice);
      if (isObject(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

export function objectValue(value: unknown): JsonObject | null {
  return isObject(value) ? value : null;
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function textValue(value: unknown): string | null {
  if (typeof value === "string") return clean(value);
  if (typeof value === "number") return String(value);
  return null;
}

export function productOffer(product: JsonObject | null): JsonObject | null {
  if (!product) return null;
  const offers = product.offers;
  if (Array.isArray(offers)) return objectValue(offers[0]);
  return objectValue(offers);
}

export function productRating(product: JsonObject | null): JsonObject | null {
  if (!product) return null;
  return objectValue(product.aggregateRating);
}

export function imageValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return unique(
    values
      .map((item) => textValue(item))
      .filter((item): item is string => Boolean(item))
      .map(normalizeImageUrl)
      .filter((item) => /^https?:\/\//.test(item)),
  ).slice(0, 12);
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function parseRating(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/([0-5](?:\.[0-9])?)/);
  return match?.[1] ? Number(match[1]) : null;
}

export function parseCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const compact = raw.replace(/,/g, "").toLowerCase();
  const match =
    compact.match(/([0-9]+(?:\.[0-9]+)?)(\s*[kml])?\s*(?:ratings?|reviews?)/) ??
    compact.match(/([0-9]+(?:\.[0-9]+)?)(\s*[kml])?/);
  if (!match?.[1]) return null;
  const base = Number(match[1]);
  const suffix = match[2]?.trim();
  if (suffix === "k") return Math.round(base * 1_000);
  if (suffix === "m") return Math.round(base * 1_000_000);
  if (suffix === "l") return Math.round(base * 100_000);
  return Math.round(base);
}

export function visibleText(doc: Document): string {
  return clean(doc.body?.innerText || doc.body?.textContent || "").slice(0, 12000);
}

export function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isVisible(node: HTMLElement): boolean {
  if (node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true") return false;
  const style = node.getAttribute("style")?.toLowerCase() || "";
  return !style.includes("display:none") && !style.includes("display: none") && !style.includes("visibility:hidden");
}

export function firstClickable(doc: Document, selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    const node = doc.querySelector<HTMLElement>(selector);
    if (node && isVisible(node)) return node;
  }
  return null;
}

export function firstClickableByText(doc: Document, textNeedles: readonly string[]): HTMLElement | null {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>("button, input, a, div[role='button']"));
  return (
    candidates.find((node) => {
      if (!isVisible(node)) return false;
      const label = clean(
        [
          node.innerText,
          node.textContent,
          node.getAttribute("aria-label"),
          node.getAttribute("value"),
          node.getAttribute("title"),
        ]
          .filter(Boolean)
          .join(" "),
      ).toLowerCase();
      return textNeedles.some((needle) => label.includes(needle));
    }) ?? null
  );
}

function cssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function collectProductNodes(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(collectProductNodes);
  if (!isObject(value)) return [];
  const nodes = hasJsonLdType(value, "Product") ? [value] : [];
  const graph = value["@graph"];
  return graph ? [...nodes, ...collectProductNodes(graph)] : nodes;
}

function hasJsonLdType(value: JsonObject, type: string): boolean {
  const rawType = value["@type"];
  if (typeof rawType === "string") return rawType.toLowerCase() === type.toLowerCase();
  return Array.isArray(rawType) && rawType.some((item) => typeof item === "string" && item.toLowerCase() === type.toLowerCase());
}

function balancedJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeImageUrl(value: string): string {
  return value.replace(/^http:\/\//, "https://");
}
