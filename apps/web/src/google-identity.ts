export interface GoogleCredentialResponse {
  readonly credential?: string;
  readonly select_by?: string;
}

interface GoogleIdClient {
  initialize(config: {
    readonly client_id: string;
    readonly callback: (response: GoogleCredentialResponse) => void;
    readonly ux_mode?: "popup" | "redirect";
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      readonly type?: "standard" | "icon";
      readonly theme?: "outline" | "filled_blue" | "filled_black";
      readonly size?: "large" | "medium" | "small";
      readonly text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      readonly shape?: "rectangular" | "pill" | "circle" | "square";
      readonly logo_alignment?: "left" | "center";
      readonly width?: number;
    },
  ): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: {
      readonly accounts: {
        readonly id: GoogleIdClient;
      };
    };
  }
}

const GOOGLE_IDENTITY_SCRIPT_ID = "google-identity-services";
const GOOGLE_IDENTITY_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let loadPromise: Promise<void> | null = null;
let initializedClientId = "";
let credentialCallback: ((response: GoogleCredentialResponse) => void) | null = null;

export function getGoogleClientId(): string {
  return getRuntimeGoogleClientId();
}

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Identity Services failed to load")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity Services failed to load"));
    document.head.append(script);
  });

  return loadPromise;
}

export async function initializeGoogleIdentity(
  clientId: string,
  callback: (response: GoogleCredentialResponse) => void,
): Promise<void> {
  await loadGoogleIdentity();
  if (!window.google?.accounts.id) throw new Error("Google Identity Services is unavailable");

  credentialCallback = callback;
  if (initializedClientId === clientId) return;

  window.google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: "popup",
    callback: (response) => credentialCallback?.(response),
  });
  initializedClientId = clientId;
}

export function disableGoogleAutoSelect(): void {
  window.google?.accounts.id.disableAutoSelect();
}
import { getGoogleClientId as getRuntimeGoogleClientId } from "./runtime-config";
