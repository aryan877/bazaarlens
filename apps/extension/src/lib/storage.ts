export interface ExtensionSettings {
  readonly apiUrl: string;
  readonly accessToken: string | null;
}

const env = import.meta.env as ImportMetaEnv & { readonly WXT_API_URL?: string };
const DEFAULT_API_URL = env.WXT_API_URL || "http://localhost:8787";
const KEY = "bazaarLensSettings";

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = (await chrome.storage.local.get(KEY)) as Record<string, Partial<ExtensionSettings> | undefined>;
  const settings = stored[KEY];
  return {
    apiUrl: settings?.apiUrl ?? DEFAULT_API_URL,
    accessToken: settings?.accessToken ?? null,
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}
