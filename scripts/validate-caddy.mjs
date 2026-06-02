import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getEnvPath } from "./lib/env-file.mjs";

const CADDY_IMAGE = process.env.CADDY_IMAGE ?? "caddy:2.11.4-alpine";
const envPath = getEnvPath(process.argv.slice(2), "deploy/production.env.example");
const caddyfilePath = resolve("deploy/Caddyfile");

if (!envPath || !existsSync(envPath)) {
  console.error(`Caddy env file not found: ${envPath ?? "(none)"}`);
  process.exit(1);
}

if (!existsSync(caddyfilePath)) {
  console.error(`Caddyfile not found: ${caddyfilePath}`);
  process.exit(1);
}

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--env-file",
    envPath,
    "-v",
    `${caddyfilePath}:/etc/caddy/Caddyfile:ro`,
    CADDY_IMAGE,
    "caddy",
    "validate",
    "--config",
    "/etc/caddy/Caddyfile",
    "--adapter",
    "caddyfile",
  ],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
