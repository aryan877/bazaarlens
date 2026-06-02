import { resolve4 } from "node:dns/promises";
import {
  createCloudflareDnsPlan,
  parseCloudflareDnsOptions,
  sanitizeCloudflareError,
  validateCloudflareDnsState,
} from "./lib/cloudflare-dns.mjs";

const options = parseCloudflareDnsOptions();
const plan = createCloudflareDnsPlan(options);

if (!options.token) {
  fail(`CLOUDFLARE_API_TOKEN is required. Put it in ${options.envFile} or export it in the shell.`);
}

if (options.dryRun) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        envFile: options.envFile,
        zoneName: options.zoneName,
        zoneIdConfigured: Boolean(options.zoneId),
        targetIpConfigured: Boolean(options.targetIp),
        verifyTokenUrl: plan.verifyTokenUrl,
        zoneListUrl: plan.zoneListUrl,
        expectedNames: plan.expectedNames,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const token = await cloudflareGet(plan.verifyTokenUrl);
const zone = options.zoneId ? { id: options.zoneId, name: options.zoneName } : await findZone();
const recordsResponse = await cloudflareGet(plan.recordsUrl(zone.id));
const publicDns = Object.fromEntries(
  await Promise.all(
    plan.expectedNames.map(async (name) => {
      try {
        return [name, await resolve4(name)];
      } catch {
        return [name, []];
      }
    }),
  ),
);
const validation = validateCloudflareDnsState({
  tokenStatus: token.result?.status,
  zone,
  records: recordsResponse.result ?? [],
  publicDns,
  expectedNames: plan.expectedNames,
  targetIp: options.targetIp,
});

if (!validation.ok) {
  console.error(JSON.stringify({ ok: false, zoneName: options.zoneName, targetIpConfigured: Boolean(options.targetIp), problems: validation.problems }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      zoneName: options.zoneName,
      zoneStatus: zone.status,
      tokenStatus: token.result?.status,
      targetIpConfigured: Boolean(options.targetIp),
      records: validation.records,
    },
    null,
    2,
  ),
);

async function findZone() {
  const response = await cloudflareGet(plan.zoneListUrl);
  const zones = response.result ?? [];
  const zone = zones.find((candidate) => candidate.name === options.zoneName);
  if (!zone) {
    throw new Error(`Cloudflare zone ${options.zoneName} was not found. If the token cannot list zones, set CLOUDFLARE_ZONE_ID in ${options.envFile}.`);
  }
  return zone;
}

async function cloudflareGet(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    throw new Error(sanitizeCloudflareError(body));
  }
  return body;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
