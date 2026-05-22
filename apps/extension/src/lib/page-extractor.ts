import { ProductPageSchema, parsePrice, type BrowserCommand, type ProductPage } from "@bazaarlens/shared";
import {
  clean,
  firstClickable,
  firstClickableByText,
  parseCount,
  parseRating,
  siteAdapterForUrl,
  visibleText,
} from "./sites";

export interface BrowserCommandResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly error?: string;
}

export interface ExecuteBrowserCommandOptions {
  readonly openUrl?: (url: string) => void;
  readonly url?: string;
}

export function extractProductPage(doc: Document, url: string, titleFallback = doc.title): ProductPage {
  const parsedUrl = new URL(url);
  const adapter = siteAdapterForUrl(parsedUrl);
  const signals = adapter.extract({ doc, url: parsedUrl, rawUrl: url, titleFallback });

  return ProductPageSchema.parse({
    url,
    merchant: adapter.merchant,
    title: clean(signals.title || titleFallback || "Unknown product"),
    price: parsePrice(signals.priceText ?? null),
    mrp: parsePrice(signals.mrpText ?? null),
    discountText: signals.discountText ?? null,
    rating: parseRating(signals.ratingText),
    reviewCount: parseCount(signals.reviewText),
    seller: signals.seller ?? null,
    availability: signals.availability ?? null,
    delivery: signals.delivery ?? null,
    returnPolicy: signals.returnPolicy ?? null,
    selectedSize: signals.selectedSize ?? null,
    images: (signals.images ?? []).slice(0, 12),
    breadcrumbs: (signals.breadcrumbs ?? []).slice(0, 12),
    visibleText: visibleText(doc),
    extractedAt: new Date().toISOString(),
  });
}

export function executeBrowserCommand(
  doc: Document,
  command: BrowserCommand,
  options: ExecuteBrowserCommandOptions = {},
): BrowserCommandResult {
  if (command.command === "noop") return { ok: true, message: command.message };
  if (command.command === "open_url" && command.url) {
    options.openUrl?.(command.url);
    return { ok: true, message: command.message };
  }

  const adapter = siteAdapterForUrl(safeUrl(options.url || doc.location?.href));
  const action = command.command === "click_wishlist" ? adapter.actions.wishlist : adapter.actions.addToCart;
  const selectors = command.selector ? [command.selector, ...action.selectors] : action.selectors;
  const button = firstClickable(doc, selectors) ?? firstClickableByText(doc, action.textNeedles);
  if (!button) return { ok: false, error: "Could not find a safe matching button on this page." };
  button.click();
  return { ok: true, message: command.message };
}

function safeUrl(url: string | undefined): URL {
  try {
    return new URL(url || "https://example.test");
  } catch {
    return new URL("https://example.test");
  }
}
