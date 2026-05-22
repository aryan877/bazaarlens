import type { Merchant } from "@bazaarlens/shared";

export interface ExtractContext {
  readonly doc: Document;
  readonly url: URL;
  readonly rawUrl: string;
  readonly titleFallback: string;
}

export interface ProductSignals {
  readonly title?: string | null;
  readonly priceText?: string | null;
  readonly mrpText?: string | null;
  readonly discountText?: string | null;
  readonly ratingText?: string | null;
  readonly reviewText?: string | null;
  readonly seller?: string | null;
  readonly availability?: string | null;
  readonly delivery?: string | null;
  readonly returnPolicy?: string | null;
  readonly selectedSize?: string | null;
  readonly breadcrumbs?: string[];
  readonly images?: string[];
}

export interface BrowserActionConfig {
  readonly selectors: string[];
  readonly textNeedles: string[];
}

export interface SiteAdapter {
  readonly merchant: Merchant;
  matches(hostname: string): boolean;
  extract(context: ExtractContext): ProductSignals;
  readonly actions: {
    readonly addToCart: BrowserActionConfig;
    readonly wishlist: BrowserActionConfig;
  };
}
