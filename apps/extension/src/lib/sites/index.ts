import { amazonAdapter } from "./amazon";
import { flipkartAdapter } from "./flipkart";
import { genericAdapter } from "./generic";
import { myntraAdapter } from "./myntra";
import type { SiteAdapter } from "./types";

export const siteAdapters = [amazonAdapter, flipkartAdapter, myntraAdapter, genericAdapter] as const satisfies readonly SiteAdapter[];

export function siteAdapterForUrl(url: URL): SiteAdapter {
  return siteAdapters.find((adapter) => adapter.matches(url.hostname)) ?? genericAdapter;
}

export { clean, firstClickable, firstClickableByText, isVisible, parseCount, parseRating, visibleText } from "./dom";
export type { BrowserActionConfig, ExtractContext, ProductSignals, SiteAdapter } from "./types";
