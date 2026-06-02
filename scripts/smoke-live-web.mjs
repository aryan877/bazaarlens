import { mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const webUrl = stripTrailingSlash(process.env.WEB_URL ?? "https://bazaarlens.xyz");
const apiUrl = stripTrailingSlash(process.env.API_URL ?? "https://api.bazaarlens.xyz");
const outDir = process.env.SCREENSHOT_DIR ?? join(tmpdir(), "bazaarlens-live-web");
const requireGoogle = process.env.REQUIRE_GOOGLE === "1";

mkdirSync(outDir, { recursive: true });

const html = await readText(`${webUrl}/`);
assert(html.includes('<div id="root"></div>'), "web root should serve the React app shell");
assert(html.includes("/bazaarlens-config.js"), "web root should load runtime public config");
assert(html.includes("<title>BazaarLens</title>"), "web root should use the BazaarLens title");

const runtimeConfig = await readText(`${webUrl}/bazaarlens-config.js`);
assert(runtimeConfig.includes(`apiUrl: "${apiUrl}"`), "runtime config should point at the deployed API URL");
assert(!runtimeConfig.includes("GOOGLE_VERTEX_API_KEY"), "runtime config must not expose backend secret names");
assert(!runtimeConfig.includes("A2A_AGENT_KEY"), "runtime config must not expose A2A secrets");

const readiness = await readJson(`${apiUrl}/health/ready`);
assert(readiness.ok === true, "API readiness should be ok");
assert(readiness.checks?.database === "ok", "API readiness should include database ok");
assert(readiness.checks?.ai === "google-vertex-configured", "API readiness should report Google Cloud Gemini configured");
if (requireGoogle) {
  assert(readiness.checks?.google === "configured", "REQUIRE_GOOGLE=1 expects API readiness to report Google configured");
  assert(
    /googleClientId: "[a-z0-9-]+\.apps\.googleusercontent\.com"/i.test(runtimeConfig),
    "REQUIRE_GOOGLE=1 expects web runtime config to expose a Google web client ID",
  );
}

const desktop = join(outDir, "desktop.png");
const mobile = join(outDir, "mobile.png");
runPlaywrightScreenshot([
  "--viewport-size",
  "1440,1000",
  "--wait-for-selector",
  "text=BazaarLens",
  "--wait-for-timeout",
  "1000",
  `${webUrl}/`,
  desktop,
]);
runPlaywrightScreenshot([
  "-b",
  "chromium",
  "--viewport-size",
  "390,844",
  "--user-agent",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "--wait-for-selector",
  "text=BazaarLens",
  "--wait-for-timeout",
  "1000",
  `${webUrl}/`,
  mobile,
]);

for (const path of [desktop, mobile]) {
  const dimensions = readPngDimensions(path);
  assert(dimensions, `${path} should be a PNG screenshot`);
  assert(statSync(path).size > 20_000, `${path} should not be a tiny or blank screenshot`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      webUrl,
      apiUrl,
      requireGoogle,
      screenshots: { desktop, mobile },
      apiReadiness: readiness.checks,
    },
    null,
    2,
  ),
);

async function readText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}: ${response.statusText}`);
  return response.text();
}

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}: ${await response.text()}`);
  return response.json();
}

function runPlaywrightScreenshot(args) {
  const result = spawnSync("playwright", ["screenshot", ...args], { stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    throw new Error("Playwright CLI is required for live web screenshot smoke. Install it or run from a machine with `playwright` on PATH.");
  }
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function readPngDimensions(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
