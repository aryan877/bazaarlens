import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function getEnvPath(argv = process.argv.slice(2), fallback = null, options = {}) {
  const ignoredFlags = new Set(options.ignoredFlags ?? []);
  const envArg = argv.find((arg) => arg !== "--" && !ignoredFlags.has(arg));
  if (envArg) return resolve(envArg);
  if (process.env.BAZAARLENS_ENV_FILE) return resolve(process.env.BAZAARLENS_ENV_FILE);
  return fallback ? resolve(fallback) : null;
}

export function hasFlag(argv = process.argv.slice(2), flag) {
  return argv.includes(flag);
}

export function loadEnvFile(envPath) {
  if (!existsSync(envPath)) {
    throw new Error(`Environment file not found: ${envPath}`);
  }
  return parseEnvFile(readFileSync(envPath, "utf8"));
}

export function parseEnvFile(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    const rawValue = line.slice(equals + 1).trim();
    values[key] = stripQuotes(rawValue);
  }
  return values;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
