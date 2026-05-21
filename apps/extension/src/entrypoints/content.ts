import type { BrowserCommand } from "@bazaarlens/shared";
import { executeBrowserCommand, extractProductPage } from "../lib/page-extractor";

type ExtensionMessage =
  | { type: "BAZAARLENS_EXTRACT" }
  | { type: "BAZAARLENS_EXECUTE"; command: BrowserCommand };

export default defineContentScript({
  matches: [
    "https://www.amazon.in/*",
    "https://amazon.in/*",
    "https://www.flipkart.com/*",
    "https://www.myntra.com/*",
  ],
  runAt: "document_idle",
  main() {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      try {
        if (message.type === "BAZAARLENS_EXTRACT") {
          sendResponse({ ok: true, page: extractProductPage(document, location.href) });
          return;
        }
        if (message.type === "BAZAARLENS_EXECUTE") {
          sendResponse(
            executeBrowserCommand(document, message.command, {
              openUrl: (url) => window.open(url, "_blank", "noopener,noreferrer"),
              url: location.href,
            }),
          );
          return;
        }
      } catch (error) {
        sendResponse({ ok: false, error: (error as Error).message });
      }
    });
  },
});
