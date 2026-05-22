import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { extractProductPage } from "./page-extractor";

const liveDescribe = process.env.LIVE_COMMERCE_SMOKE === "1" ? describe : describe.skip;

const cases = [
  {
    merchant: "amazon",
    url:
      process.env.LIVE_AMAZON_URL ??
      "https://www.amazon.in/iQOO-Tornado-Storage-Snapdragon-FlashCharge/dp/B07WHQHNZC",
    path: process.env.LIVE_AMAZON_HTML,
  },
  {
    merchant: "flipkart",
    url:
      process.env.LIVE_FLIPKART_URL ??
      "https://www.flipkart.com/cmf-nothing-phone-1-black-128-gb/p/itmeef68c7ce70bf?pid=MOBHYBQTSE9EKVBT",
    path: process.env.LIVE_FLIPKART_HTML,
  },
  {
    merchant: "myntra",
    url: process.env.LIVE_MYNTRA_URL ?? "https://www.myntra.com/shoes/power/power-men-sneakers/31815940/buy",
    path: process.env.LIVE_MYNTRA_HTML,
  },
] as const;

liveDescribe("live commerce extraction", () => {
  for (const site of cases) {
    it(`extracts current ${site.merchant} product page signals`, async () => {
      expect(site.path, `${site.merchant} fixture path`).toBeTruthy();
      const html = await readFile(site.path!, "utf8");
      expect(html.length, `${site.merchant} html size`).toBeGreaterThan(1000);

      const window = new Window({
        url: site.url,
        settings: {
          disableJavaScriptEvaluation: true,
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
        },
      });
      window.document.write(staticProductHtml(html));
      window.document.close();

      const page = extractProductPage(window.document as unknown as Document, site.url);

      expect(page.merchant).toBe(site.merchant);
      expect(page.title).not.toMatch(/captcha|robot check|sorry, we just need/i);
      expect(page.title.length).toBeGreaterThan(10);
      expect(page.visibleText.length).toBeGreaterThan(100);

      if (site.merchant === "amazon") {
        expect(page.rating ?? page.reviewCount ?? page.availability).toBeTruthy();
      } else {
        expect(page.price?.amount, `${site.merchant} price`).toBeGreaterThan(0);
        expect(page.images.length, `${site.merchant} images`).toBeGreaterThan(0);
      }

      console.info(
        `[live-site] ${site.merchant}: ${page.title.slice(0, 96)} | price=${page.price?.raw ?? "n/a"} | rating=${
          page.rating ?? "n/a"
        } | reviews=${page.reviewCount ?? "n/a"} | availability=${page.availability ?? "n/a"}`,
      );
    });
  }
});

function staticProductHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, (script) => {
      if (/application\/ld\+json/i.test(script) || /window\.__myx\s*=/.test(script)) return script;
      return "";
    })
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
}
