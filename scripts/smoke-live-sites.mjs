import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const outDir = join(tmpdir(), "bazaarlens-live-sites");
mkdirSync(outDir, { recursive: true });

const sites = {
  amazon: {
    url: "https://www.amazon.in/iQOO-Tornado-Storage-Snapdragon-FlashCharge/dp/B07WHQHNZC",
    path: join(outDir, "amazon.html"),
    command: "fetch",
  },
  flipkart: {
    url: "https://www.flipkart.com/cmf-nothing-phone-1-black-128-gb/p/itmeef68c7ce70bf?pid=MOBHYBQTSE9EKVBT",
    path: join(outDir, "flipkart.html"),
    command: "get",
  },
  myntra: {
    url: "https://www.myntra.com/shoes/power/power-men-sneakers/31815940/buy",
    path: join(outDir, "myntra.html"),
    command: "get",
  },
};

for (const site of Object.values(sites)) {
  const args =
    site.command === "fetch"
      ? [
          "extract",
          "fetch",
          site.url,
          site.path,
          "--real-chrome",
          "--network-idle",
          "--timeout",
          "60000",
          "--wait",
          "3000",
          "-H",
          "Accept-Language: en-IN,en;q=0.9",
        ]
      : [
          "extract",
          "get",
          site.url,
          site.path,
          "--timeout",
          "60",
          "--impersonate",
          "chrome",
          "-H",
          "Accept-Language: en-IN,en;q=0.9",
        ];

  run("scrapling", args);
}

run("pnpm", ["--filter", "@bazaarlens/extension", "exec", "vitest", "run", "src/lib/live-sites.test.ts"], {
  LIVE_COMMERCE_SMOKE: "1",
  LIVE_AMAZON_URL: sites.amazon.url,
  LIVE_AMAZON_HTML: sites.amazon.path,
  LIVE_FLIPKART_URL: sites.flipkart.url,
  LIVE_FLIPKART_HTML: sites.flipkart.path,
  LIVE_MYNTRA_URL: sites.myntra.url,
  LIVE_MYNTRA_HTML: sites.myntra.path,
});

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
