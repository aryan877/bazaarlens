import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { isGoogleWebClientId, updateGoogleOAuthEnvText } from "./lib/google-oauth-env.mjs";

const clientId = valueFromArg("--client-id") ?? process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID;
const deployHost = valueFromArg("--host") ?? process.env.DEPLOY_HOST ?? "hackathon-server";
const deployDir = valueFromArg("--dir") ?? process.env.DEPLOY_DIR ?? "/opt/bazaarlens";
const dryRun = process.argv.includes("--dry-run");

if (!clientId) {
  fail("Google OAuth client ID is required. Pass --client-id=... or set GOOGLE_CLIENT_ID.");
}
if (!isGoogleWebClientId(clientId)) {
  fail("Google OAuth client ID must look like a web client ID ending in .apps.googleusercontent.com.");
}

const remoteEnvPath = `${deployDir}/.env`;
const remoteComposePath = `${deployDir}/docker-compose.yml`;
const remoteEnv = ssh(["cat", remoteEnvPath], { capture: true });
const nextEnv = updateGoogleOAuthEnvText(remoteEnv.stdout, clientId);

if (dryRun) {
  console.log(JSON.stringify({ ok: true, dryRun: true, deployHost, deployDir, googleClientIdConfigured: true }, null, 2));
  process.exit(0);
}

const tempDir = mkdtempSync(join(tmpdir(), "bazaarlens-google-oauth-"));
const tempEnv = join(tempDir, "env");
try {
  writeFileSync(tempEnv, nextEnv, { mode: 0o600 });
  scp(tempEnv, `${deployHost}:${remoteEnvPath}.next`);
  ssh(["sh", "-lc", `set -euo pipefail
    install -m 600 -o root -g root ${shellQuote(remoteEnvPath)}.next ${shellQuote(remoteEnvPath)}
    rm -f ${shellQuote(remoteEnvPath)}.next
    cd ${shellQuote(deployDir)}
    docker compose --env-file .env -f ${shellQuote(remoteComposePath)} config --quiet
    docker compose --env-file .env -f ${shellQuote(remoteComposePath)} up -d --no-deps --force-recreate api web
  `]);

  const health = waitForJson(`https://api.bazaarlens.xyz/health/ready`, (body) => body?.checks?.google === "configured");
  const runtimeConfig = waitForText(`https://bazaarlens.xyz/bazaarlens-config.js`, (text) =>
    text.includes(`googleClientId: "${clientId}"`),
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        deployHost,
        deployDir,
        google: health.checks.google,
        webRuntimeConfigUpdated: runtimeConfig.includes(clientId),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function waitForJson(url, predicate) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const result = spawnSync("curl", ["-fsS", url], { encoding: "utf8" });
      if (result.status === 0) {
        const body = JSON.parse(result.stdout);
        if (predicate(body)) return body;
      } else {
        lastError = new Error(result.stderr || result.stdout);
      }
    } catch (error) {
      lastError = error;
    }
    sleep(1000);
  }
  throw lastError ?? new Error(`${url} did not satisfy readiness predicate`);
}

function waitForText(url, predicate) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync("curl", ["-fsS", url], { encoding: "utf8" });
    if (result.status === 0 && predicate(result.stdout)) return result.stdout;
    lastError = new Error(result.stderr || result.stdout);
    sleep(1000);
  }
  throw lastError ?? new Error(`${url} did not satisfy text predicate`);
}

function ssh(args, options = {}) {
  const result = spawnSync("ssh", ["-o", "BatchMode=yes", deployHost, ...args], {
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(result.stderr || result.stdout || `ssh ${deployHost} failed with ${result.status}`);
  }
  return result;
}

function scp(source, target) {
  const result = spawnSync("scp", [source, target], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function valueFromArg(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
}

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
