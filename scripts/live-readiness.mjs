import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { getEnvPath, hasFlag, loadEnvFile } from "./lib/env-file.mjs";

if (isMain()) main();

function main() {
  const argv = process.argv.slice(2);
  const requireGoogle = hasFlag(argv, "--require-google") || process.env.REQUIRE_GOOGLE === "1";
  const skipLiveSmoke = hasFlag(argv, "--skip-live-smoke") || process.env.BAZAARLENS_SKIP_LIVE_SMOKE === "1";
  const envPath = getEnvPath(argv, "deploy/production.env.example", { ignoredFlags: ["--require-google", "--skip-live-smoke"] });
  const env = loadEnvFile(envPath);
  const skipDockerBuild = process.env.BAZAARLENS_SKIP_DOCKER_BUILD === "1";
  const plan = createLiveReadinessPlan({
    envPath,
    env,
    requireGoogle,
    skipDockerBuild,
    skipLiveSmoke,
  });

  for (const step of plan.steps) {
    runStep(step);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        envFile: envPath,
        apiUrl: plan.apiUrl,
        webUrl: plan.webUrl,
        requireGoogle,
        dockerImagesBuilt: !skipDockerBuild,
        liveSmoke: !skipLiveSmoke,
        extensionZip: resolve("artifacts/bazaarlens-0.1.0-chrome.zip"),
      },
      null,
      2,
    ),
  );
}

export function createLiveReadinessPlan({ envPath, env, requireGoogle = false, skipDockerBuild = false, skipLiveSmoke = false }) {
  const apiUrl = required(env, "WXT_API_URL");
  const webUrl = webOrigin(env);
  const prodCheckCommand = ["pnpm", "prod:check", "--", envPath];
  if (requireGoogle) prodCheckCommand.push("--require-google");

  const steps = [
    {
      name: "workspace verify",
      command: ["pnpm", "verify"],
    },
    {
      name: "production env",
      command: prodCheckCommand,
    },
    {
      name: "caddy config",
      command: ["pnpm", "prod:caddy:validate", "--", envPath],
    },
    {
      name: "local compose config",
      command: ["docker", "compose", "config", "--quiet"],
    },
    {
      name: "production compose config",
      command: ["docker", "compose", "--env-file", envPath, "-f", "docker-compose.prod.yml", "config", "--quiet"],
      env: { BAZAARLENS_ENV_FILE: envPath },
    },
    {
      name: "store extension build",
      command: ["pnpm", "--filter", "@bazaarlens/extension", "build"],
      env: { WXT_API_URL: apiUrl },
    },
    {
      name: "store extension output",
      command: ["pnpm", "extension:store:validate"],
      env: { WXT_API_URL: apiUrl },
    },
    {
      name: "extension package",
      command: ["pnpm", "docker:extension"],
      env: { WXT_API_URL: apiUrl },
    },
    {
      name: "extension package output",
      command: ["pnpm", "extension:store:package:validate"],
      env: { WXT_API_URL: apiUrl },
    },
  ];

  if (!skipDockerBuild) {
    steps.splice(5, 0, {
      name: "production docker images",
      command: ["docker", "compose", "build", "api", "web"],
    });
  }

  if (!skipLiveSmoke) {
    steps.push(
      {
        name: "live web/API smoke",
        command: ["pnpm", "smoke:live:web"],
        env: {
          WEB_URL: webUrl,
          API_URL: apiUrl,
          REQUIRE_GOOGLE: requireGoogle ? "1" : "0",
        },
      },
      {
        name: "live A2A submission smoke",
        command: ["pnpm", "smoke:a2a"],
        env: { API_URL: apiUrl },
      },
    );
  }

  return { apiUrl, webUrl, steps };
}

function runStep(step) {
  console.log(`\n==> ${step.name}`);
  const result = spawnSync(step.command[0], step.command.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(step.env ?? {}),
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function required(values, key) {
  const value = values[key];
  if (!value) {
    throw new Error(`${key} is required in ${envPath}`);
  }
  return value;
}

function webOrigin(values) {
  const origin = (values.CORS_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)[0];
  return origin || "https://bazaarlens.xyz";
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
