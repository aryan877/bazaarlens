import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "./env-file.mjs";

const DEFAULT_ENV_FILE = ".env.deploy.local";
const DEFAULT_ZONE_NAME = "bazaarlens.xyz";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

export function parseCloudflareDnsOptions(argv = process.argv.slice(2), env = process.env) {
  const envFile = valueFromArg(argv, "--env-file") ?? env.BAZAARLENS_DEPLOY_ENV_FILE ?? DEFAULT_ENV_FILE;
  const fileEnv = existsSync(envFile) ? loadEnvFile(resolve(envFile)) : {};
  return {
    envFile,
    token: env.CLOUDFLARE_API_TOKEN ?? fileEnv.CLOUDFLARE_API_TOKEN ?? "",
    zoneId: valueFromArg(argv, "--zone-id") ?? env.CLOUDFLARE_ZONE_ID ?? fileEnv.CLOUDFLARE_ZONE_ID ?? "",
    zoneName: valueFromArg(argv, "--zone") ?? env.CLOUDFLARE_ZONE_NAME ?? fileEnv.CLOUDFLARE_ZONE_NAME ?? DEFAULT_ZONE_NAME,
    targetIp: valueFromArg(argv, "--ip") ?? env.BAZAARLENS_SERVER_IP ?? fileEnv.BAZAARLENS_SERVER_IP ?? "",
    dryRun: argv.includes("--dry-run"),
  };
}

export function expectedCloudflareRecordNames(zoneName) {
  return [zoneName, `www.${zoneName}`, `api.${zoneName}`];
}

export function createCloudflareDnsPlan(options) {
  const zoneQuery = new URL(`${CLOUDFLARE_API_BASE}/zones`);
  zoneQuery.searchParams.set("name", options.zoneName);
  zoneQuery.searchParams.set("status", "active");

  return {
    verifyTokenUrl: `${CLOUDFLARE_API_BASE}/user/tokens/verify`,
    zoneListUrl: zoneQuery.toString(),
    recordsUrl: (zoneId) => {
      const recordsQuery = new URL(`${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`);
      recordsQuery.searchParams.set("type", "A");
      recordsQuery.searchParams.set("per_page", "100");
      return recordsQuery.toString();
    },
    expectedNames: expectedCloudflareRecordNames(options.zoneName),
  };
}

export function validateCloudflareDnsState({ tokenStatus, zone, records, publicDns, expectedNames, targetIp }) {
  const problems = [];
  if (tokenStatus !== "active") {
    problems.push(`Cloudflare token status is ${tokenStatus || "unknown"}, expected active`);
  }
  if (!zone?.id) {
    problems.push("Cloudflare zone was not found");
  }
  if (zone?.status && zone.status !== "active") {
    problems.push(`Cloudflare zone status is ${zone.status}, expected active`);
  }

  const normalized = records.map((record) => ({
    name: record.name,
    type: record.type,
    content: record.content,
    proxied: Boolean(record.proxied),
    ttl: record.ttl,
  }));

  for (const name of expectedNames) {
    const matching = normalized.filter((record) => record.name === name && record.type === "A");
    if (matching.length === 0) {
      problems.push(`Missing A record for ${name}`);
      continue;
    }
    if (targetIp && !matching.some((record) => record.content === targetIp)) {
      problems.push(`${name} does not point to the configured target IP`);
    }
    if (!matching.some((record) => record.proxied === false)) {
      problems.push(`${name} is not DNS-only`);
    }
  }

  if (targetIp) {
    for (const name of expectedNames) {
      const resolved = publicDns[name] ?? [];
      if (!resolved.includes(targetIp)) {
        problems.push(`Public DNS for ${name} does not resolve to the configured target IP`);
      }
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    records: expectedNames.map((name) => {
      const record = normalized.find(
        (candidate) => candidate.name === name && candidate.type === "A" && (!targetIp || candidate.content === targetIp),
      );
      return {
        name,
        type: "A",
        proxied: record?.proxied ?? null,
        publicDnsResolved: (publicDns[name] ?? []).length > 0,
        targetIpMatched: targetIp ? record?.content === targetIp && (publicDns[name] ?? []).includes(targetIp) : null,
      };
    }),
  };
}

export function sanitizeCloudflareError(body) {
  const messages = Array.isArray(body?.errors)
    ? body.errors.map((error) => error?.message).filter(Boolean)
    : [];
  return messages.length ? messages.join("; ") : "Cloudflare API request failed";
}

function valueFromArg(argv, name) {
  const exact = argv.indexOf(name);
  if (exact >= 0) return argv[exact + 1];
  const prefixed = argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
}
