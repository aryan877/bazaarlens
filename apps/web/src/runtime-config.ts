export interface BazaarLensRuntimeConfig {
  readonly apiUrl?: string;
  readonly googleClientId?: string;
}

declare global {
  interface Window {
    __BAZAARLENS_CONFIG__?: BazaarLensRuntimeConfig;
  }
}

const DEFAULT_API_URL = "http://localhost:8787";

export function getApiUrl(): string {
  return firstNonEmpty(window.__BAZAARLENS_CONFIG__?.apiUrl, import.meta.env.VITE_API_URL) ?? DEFAULT_API_URL;
}

export function getGoogleClientId(): string {
  return firstNonEmpty(window.__BAZAARLENS_CONFIG__?.googleClientId, import.meta.env.VITE_GOOGLE_CLIENT_ID) ?? "";
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean);
}
