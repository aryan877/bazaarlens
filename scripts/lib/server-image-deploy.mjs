import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_HOST = "hackathon-server";
const DEFAULT_DEPLOY_DIR = "/opt/bazaarlens";
const DEFAULT_PLATFORM = "linux/amd64";
const DEFAULT_API_IMAGE = "bazaarlens-api:server-amd64";
const DEFAULT_WEB_IMAGE = "bazaarlens-web:server-amd64";
const DEFAULT_API_URL = "https://api.bazaarlens.xyz";
const DEFAULT_BUNDLE = join(tmpdir(), "bazaarlens-images-amd64.tar.gz");

export function parseServerImageDeployOptions(argv = process.argv.slice(2), env = process.env) {
  return {
    host: valueFromArg(argv, "--host") ?? env.DEPLOY_HOST ?? DEFAULT_HOST,
    deployDir: valueFromArg(argv, "--dir") ?? env.DEPLOY_DIR ?? DEFAULT_DEPLOY_DIR,
    platform: valueFromArg(argv, "--platform") ?? env.DEPLOY_PLATFORM ?? DEFAULT_PLATFORM,
    apiImage: valueFromArg(argv, "--api-image") ?? env.BAZAARLENS_API_IMAGE ?? DEFAULT_API_IMAGE,
    webImage: valueFromArg(argv, "--web-image") ?? env.BAZAARLENS_WEB_IMAGE ?? DEFAULT_WEB_IMAGE,
    apiUrl: stripTrailingSlash(valueFromArg(argv, "--api-url") ?? env.VITE_API_URL ?? env.API_PUBLIC_URL ?? DEFAULT_API_URL),
    googleClientId: valueFromArg(argv, "--google-client-id") ?? env.VITE_GOOGLE_CLIENT_ID ?? "",
    bundlePath: valueFromArg(argv, "--bundle") ?? env.BAZAARLENS_IMAGE_BUNDLE ?? DEFAULT_BUNDLE,
    skipBuild: hasFlag(argv, "--skip-build"),
    skipSmoke: hasFlag(argv, "--skip-smoke"),
    dryRun: hasFlag(argv, "--dry-run"),
  };
}

export function createServerImageDeployPlan(options) {
  const releaseName = `bazaarlens-images-${platformSuffix(options.platform)}.tar.gz`;
  const remoteBundle = `${options.deployDir}/releases/${releaseName}`;
  const remoteNextBundle = `${remoteBundle}.next`;
  const remoteCompose = `${options.deployDir}/docker-compose.yml`;
  const remoteNextCompose = `${remoteCompose}.next`;
  const remoteEnv = `${options.deployDir}/.env`;
  const preflightScript = remotePreflightScript(options.deployDir, remoteEnv);

  const buildCommands = [
    [
      "docker",
      "buildx",
      "build",
      "--platform",
      options.platform,
      "--load",
      "-t",
      options.apiImage,
      "-f",
      "apps/api/Dockerfile",
      ".",
    ],
    [
      "docker",
      "buildx",
      "build",
      "--platform",
      options.platform,
      "--load",
      "-t",
      options.webImage,
      "--build-arg",
      `VITE_API_URL=${options.apiUrl}`,
      "--build-arg",
      `VITE_GOOGLE_CLIENT_ID=${options.googleClientId}`,
      "-f",
      "apps/web/Dockerfile",
      ".",
    ],
  ];

  return {
    options,
    releaseName,
    remoteBundle,
    remoteNextBundle,
    preflightCommand: remoteBashCommand(options.host, preflightScript),
    preflightScript,
    buildCommands,
    saveCommand: `docker save ${shellQuote(options.apiImage)} ${shellQuote(options.webImage)} | gzip -c > ${shellQuote(options.bundlePath)}`,
    scpCommand: ["scp", options.bundlePath, `${options.host}:${remoteNextBundle}`],
    composeScpCommand: ["scp", "deploy/docker-compose.server.yml", `${options.host}:${remoteNextCompose}`],
    remoteScript: [
      "set -euo pipefail",
      `cd ${shellQuote(options.deployDir)}`,
      `install -m 644 ${shellQuote(remoteNextCompose)} ${shellQuote(remoteCompose)}`,
      `rm -f ${shellQuote(remoteNextCompose)}`,
      `install -m 644 ${shellQuote(remoteNextBundle)} ${shellQuote(remoteBundle)}`,
      `rm -f ${shellQuote(remoteNextBundle)}`,
      `gzip -dc ${shellQuote(remoteBundle)} | docker load`,
      `docker compose --env-file ${shellQuote(remoteEnv)} -f ${shellQuote(remoteCompose)} config --quiet`,
      `docker rm -f bazaarlens-server-mongodb-mcp >/dev/null 2>&1 || true`,
      `docker compose --env-file ${shellQuote(remoteEnv)} -f ${shellQuote(remoteCompose)} up -d --force-recreate mongodb-mcp`,
      `docker compose --env-file ${shellQuote(remoteEnv)} -f ${shellQuote(remoteCompose)} up -d --no-deps --force-recreate api web`,
      `docker compose --env-file ${shellQuote(remoteEnv)} -f ${shellQuote(remoteCompose)} ps mongodb-mcp api web`,
    ].join("\n"),
    healthScript: [
      "set -euo pipefail",
      "for service in bazaarlens-server-api bazaarlens-server-web; do",
      "  for attempt in $(seq 1 36); do",
      "    status=$(docker inspect -f '{{.State.Health.Status}}' \"$service\" 2>/dev/null || true)",
      "    echo \"$service=$status\"",
      "    [ \"$status\" = healthy ] && break",
      "    [ \"$attempt\" = 36 ] && exit 1",
      "    sleep 2",
      "  done",
      "done",
    ].join("\n"),
    smokeCommands: [
      ["pnpm", "smoke:live:web"],
      ["pnpm", "smoke:a2a"],
      ["node", "scripts/smoke-docker.mjs"],
    ],
  };
}

export function remoteBashCommand(host, script) {
  return ["ssh", "-o", "BatchMode=yes", host, `bash -lc ${shellQuote(script)}`];
}

function remotePreflightScript(deployDir, remoteEnv) {
  return [
    "set -euo pipefail",
    `cd ${shellQuote(deployDir)}`,
    `env_file=${shellQuote(remoteEnv)}`,
    'if [ ! -f "$env_file" ]; then echo "Missing BazaarLens env file: $env_file" >&2; exit 1; fi',
    "missing=0",
    "require_key() {",
    "  key=$1",
    "  if ! awk -F= -v key=\"$key\" '$1 == key && length($2) > 0 { found=1 } END { exit found ? 0 : 1 }' \"$env_file\"; then",
    "    echo \"Missing required BazaarLens env key: $key\" >&2",
    "    missing=1",
    "  fi",
    "}",
    "require_true() {",
    "  key=$1",
    "  if [ \"$(env_value \"$key\")\" != \"true\" ]; then",
    "    echo \"Missing required BazaarLens env flag: $key=true\" >&2",
    "    missing=1",
    "  fi",
    "}",
    "has_key() {",
    "  key=$1",
    "  awk -F= -v key=\"$key\" '$1 == key && length($2) > 0 { found=1 } END { exit found ? 0 : 1 }' \"$env_file\"",
    "}",
    "env_value() {",
    "  key=$1",
    "  awk -F= -v key=\"$key\" '$1 == key { print $2; exit }' \"$env_file\"",
    "}",
    "host_google_credentials_path() {",
    "  container_path=$(env_value GOOGLE_APPLICATION_CREDENTIALS)",
    "  [ -n \"$container_path\" ] || return 1",
    "  case \"$container_path\" in",
    "    /run/secrets/bazaarlens/*)",
    "      host_dir=$(env_value GOOGLE_APPLICATION_CREDENTIALS_HOST_DIR)",
    "      [ -n \"$host_dir\" ] || host_dir=\"./secrets\"",
    "      case \"$host_dir\" in /*) ;; *) host_dir=\"$PWD/${host_dir#./}\" ;; esac",
    "      printf '%s/%s\\n' \"$host_dir\" \"${container_path##*/}\"",
    "      ;;",
    "    *)",
    "      printf '%s\\n' \"$container_path\"",
    "      ;;",
    "  esac",
    "}",
    "require_key NODE_ENV",
    "require_key API_PUBLIC_URL",
    "require_key CORS_ORIGIN",
    "require_key DATABASE_URL",
    "require_key JWT_SECRET",
    "require_key A2A_AGENT_KEY",
    "require_key HACKATHON_TRACK",
    "if [ \"$(env_value NODE_ENV)\" != \"production\" ]; then",
    "  echo \"BazaarLens server deploy requires NODE_ENV=production\" >&2",
    "  missing=1",
    "fi",
    "if ! has_key GOOGLE_VERTEX_API_KEY && ! has_key GOOGLE_VERTEX_PROJECT && ! has_key GOOGLE_CLOUD_PROJECT; then",
    "  echo \"Missing required BazaarLens env key: GOOGLE_VERTEX_API_KEY or GOOGLE_VERTEX_PROJECT or GOOGLE_CLOUD_PROJECT\" >&2",
    "  missing=1",
    "fi",
    "if ! has_key GOOGLE_VERTEX_API_KEY && (has_key GOOGLE_VERTEX_PROJECT || has_key GOOGLE_CLOUD_PROJECT); then",
    "  credentials_path=$(host_google_credentials_path || true)",
    "  if [ -z \"$credentials_path\" ]; then",
    "    echo \"Project-based Google Vertex deploy requires GOOGLE_APPLICATION_CREDENTIALS\" >&2",
    "    missing=1",
    "  elif [ ! -f \"$credentials_path\" ]; then",
    "    echo \"Google application credentials file is missing on host: $credentials_path\" >&2",
    "    missing=1",
    "  fi",
    "fi",
    "track=$(env_value HACKATHON_TRACK)",
    "case \"$track\" in",
    "  mongodb)",
    "    require_true AGENT_MEMORY_ENABLED",
    "    if ! has_key AGENT_MEMORY_MCP_HTTP_URL && ! has_key MONGODB_MEMORY_CONNECTION_STRING; then",
    "      echo \"MongoDB track requires AGENT_MEMORY_MCP_HTTP_URL or MONGODB_MEMORY_CONNECTION_STRING\" >&2",
    "      missing=1",
    "    fi",
    "    ;;",
    "  arize)",
    "    require_true ARIZE_MCP_ENABLED",
    "    require_true PHOENIX_TRACING_ENABLED",
    "    require_key PHOENIX_HOST",
    "    require_key PHOENIX_API_KEY",
    "    ;;",
    "  elastic)",
    "    require_true ELASTIC_MCP_ENABLED",
    "    if ! has_key ELASTIC_MCP_HTTP_URL && ! has_key ELASTIC_KIBANA_URL && ! has_key ELASTIC_MCP_COMMAND; then",
    "      echo \"Elastic track requires ELASTIC_MCP_HTTP_URL, ELASTIC_KIBANA_URL, or ELASTIC_MCP_COMMAND\" >&2",
    "      missing=1",
    "    fi",
    "    if ! has_key ELASTIC_PRODUCT_INDEX && ! has_key ELASTIC_PRODUCT_SEARCH_TOOL; then",
    "      echo \"Elastic track requires ELASTIC_PRODUCT_INDEX or ELASTIC_PRODUCT_SEARCH_TOOL\" >&2",
    "      missing=1",
    "    fi",
    "    ;;",
    "  fivetran)",
    "    require_true FIVETRAN_MCP_ENABLED",
    "    require_key FIVETRAN_API_KEY",
    "    require_key FIVETRAN_API_SECRET",
    "    ;;",
    "  gitlab)",
    "    require_true GITLAB_MCP_ENABLED",
    "    require_true GITLAB_MCP_AUTH_READY",
    "    require_key GITLAB_PROJECT_ID",
    "    if ! has_key GITLAB_MCP_HTTP_URL && ! has_key GITLAB_MCP_COMMAND; then",
    "      echo \"GitLab track requires GITLAB_MCP_HTTP_URL or GITLAB_MCP_COMMAND\" >&2",
    "      missing=1",
    "    fi",
    "    ;;",
    "  dynatrace)",
    "    require_true DYNATRACE_MCP_ENABLED",
    "    require_key DYNATRACE_API_TOKEN",
    "    if ! has_key DYNATRACE_MCP_HTTP_URL && ! has_key DYNATRACE_ENVIRONMENT_URL; then",
    "      echo \"Dynatrace track requires DYNATRACE_MCP_HTTP_URL or DYNATRACE_ENVIRONMENT_URL\" >&2",
    "      missing=1",
    "    fi",
    "    ;;",
    "  *)",
    "    echo \"HACKATHON_TRACK must be one of mongodb, arize, elastic, fivetran, gitlab, dynatrace\" >&2",
    "    missing=1",
    "    ;;",
    "esac",
    'if [ "$missing" -ne 0 ]; then exit 1; fi',
    'echo "BazaarLens remote deploy preflight passed for HACKATHON_TRACK=$track"',
  ].join("\n");
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function valueFromArg(argv, name) {
  const exact = argv.indexOf(name);
  if (exact >= 0) return argv[exact + 1];
  const prefixed = argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function platformSuffix(platform) {
  return platform.replace(/^linux\//, "").replace(/[^a-z0-9_.-]/gi, "-");
}
