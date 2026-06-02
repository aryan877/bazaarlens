import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const OUTPUT_DIR = resolve(process.env.EXTENSION_OUTPUT_DIR ?? "apps/extension/.output/chrome-mv3");
const MANIFEST_PATH = resolve(OUTPUT_DIR, "manifest.json");
const STORE_BUILD = process.env.EXTENSION_STORE_BUILD === "1";
const VALIDATE_ZIP = process.env.EXTENSION_VALIDATE_ZIP === "1" || Boolean(process.env.EXTENSION_ZIP_PATH);
const EXPECTED_API_PERMISSION = process.env.WXT_API_URL
  ? `${new URL(process.env.WXT_API_URL).origin}/*`
  : process.env.EXTENSION_OUTPUT_DIR
    ? null
    : "http://localhost:8787/*";
const MAX_WEB_STORE_ZIP_BYTES = 2 * 1024 * 1024 * 1024;
const REQUIRED_ICON_SIZES = [16, 32, 48, 128];
const REQUIRED_COMMERCE_HOSTS = [
  "https://www.amazon.in/*",
  "https://amazon.in/*",
  "https://www.flipkart.com/*",
  "https://www.myntra.com/*",
];

if (!existsSync(MANIFEST_PATH)) {
  fail("Extension manifest is missing. Run `pnpm --filter @bazaarlens/extension build` first.");
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const errors = [
  ...validateManifest(manifest),
  ...validateIcons(manifest),
  ...validateZipIfPresent(manifest),
];

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      manifest: MANIFEST_PATH,
      name: manifest.name,
      version: manifest.version,
      storeBuild: STORE_BUILD,
      permissions: manifest.permissions,
      hostPermissions: manifest.host_permissions,
    },
    null,
    2,
  ),
);

function validateManifest(manifest) {
  const errors = [];
  if (manifest.manifest_version !== 3) errors.push("manifest_version must be 3");
  if (manifest.name !== "BazaarLens") errors.push("manifest name must be BazaarLens");
  if (!manifest.description || manifest.description.length > 132) {
    errors.push("manifest description is required and must be 132 characters or fewer");
  }
  if (!manifest.side_panel?.default_path) errors.push("side_panel.default_path is required");
  if (!manifest.action?.default_title) errors.push("action.default_title is required");

  const permissions = new Set(manifest.permissions ?? []);
  for (const permission of ["activeTab", "storage", "sidePanel"]) {
    if (!permissions.has(permission)) errors.push(`missing permission: ${permission}`);
  }
  if (permissions.has("tabs")) {
    errors.push("avoid the broad tabs permission; activeTab is enough for the current-tab workflow");
  }

  const hostPermissions = new Set(manifest.host_permissions ?? []);
  for (const host of REQUIRED_COMMERCE_HOSTS) {
    if (!hostPermissions.has(host)) errors.push(`missing host permission: ${host}`);
  }
  const apiHostPermissions = [...hostPermissions].filter((host) => !REQUIRED_COMMERCE_HOSTS.includes(host));
  if (apiHostPermissions.length === 0) {
    errors.push("host_permissions must include the configured API origin");
  }
  if (EXPECTED_API_PERMISSION && !hostPermissions.has(EXPECTED_API_PERMISSION)) {
    errors.push(`host_permissions must include configured API origin: ${EXPECTED_API_PERMISSION}`);
  }
  if (STORE_BUILD) {
    if (!process.env.WXT_API_URL) {
      errors.push("store validation requires WXT_API_URL");
    }
    for (const host of hostPermissions) {
      if (host.includes("localhost") || host.includes("127.0.0.1")) {
        errors.push(`store build must not include local host permission: ${host}`);
      }
      if (host.startsWith("http://")) {
        errors.push(`store build host permissions must use https: ${host}`);
      }
    }
  }

  return errors;
}

function validateIcons(manifest) {
  const errors = [];
  for (const size of REQUIRED_ICON_SIZES) {
    const iconPath = manifest.icons?.[String(size)];
    const actionIconPath = manifest.action?.default_icon?.[String(size)];
    if (!iconPath) {
      errors.push(`missing manifest icon ${size}`);
      continue;
    }
    if (actionIconPath !== iconPath) {
      errors.push(`action.default_icon ${size} must match manifest icon`);
    }

    const absolutePath = resolve(OUTPUT_DIR, iconPath);
    if (!existsSync(absolutePath)) {
      errors.push(`missing icon file: ${iconPath}`);
      continue;
    }
    const dimensions = readPngDimensions(absolutePath);
    if (!dimensions) {
      errors.push(`icon must be a PNG file: ${iconPath}`);
      continue;
    }
    if (dimensions.width !== size || dimensions.height !== size) {
      errors.push(`icon ${iconPath} must be ${size}x${size}, got ${dimensions.width}x${dimensions.height}`);
    }
  }
  return errors;
}

function validateZipIfPresent(manifest) {
  if (!VALIDATE_ZIP) return [];
  const zipPath = resolve(process.env.EXTENSION_ZIP_PATH ?? `artifacts/bazaarlens-${manifest.version}-chrome.zip`);
  if (!existsSync(zipPath)) return [];
  const errors = [];
  if (statSync(zipPath).size > MAX_WEB_STORE_ZIP_BYTES) {
    errors.push("Chrome Web Store package exceeds 2GB");
  }
  const listing = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  if (listing.status !== 0) {
    errors.push(`could not inspect extension zip: ${listing.stderr || listing.stdout}`);
    return errors;
  }
  const entries = new Set(listing.stdout.split(/\r?\n/).filter(Boolean));
  for (const entry of ["manifest.json", "sidepanel.html", "background.js"]) {
    if (!entries.has(entry)) errors.push(`zip missing ${entry}`);
  }
  for (const size of REQUIRED_ICON_SIZES) {
    const iconPath = manifest.icons?.[String(size)];
    if (iconPath && !entries.has(iconPath)) errors.push(`zip missing ${iconPath}`);
  }
  return errors;
}

function readPngDimensions(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
