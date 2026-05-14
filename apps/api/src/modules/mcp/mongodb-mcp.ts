export const MONGODB_MCP_SERVER_VERSION = "1.12.0";
export const MONGODB_MCP_REDACT_VERSION = "1.4.6";

export const DEFAULT_MONGODB_MCP_ARGS = [
  "-y",
  "-p",
  `mongodb-redact@${MONGODB_MCP_REDACT_VERSION}`,
  "-p",
  `mongodb-mcp-server@${MONGODB_MCP_SERVER_VERSION}`,
  "mongodb-mcp-server",
  "--telemetry",
  "disabled",
  "--loggers",
  "stderr",
] as const;

export const MONGODB_MCP_LAUNCH = `npx ${DEFAULT_MONGODB_MCP_ARGS.join(" ")}`;
export const MONGODB_MCP_DOCKER_HTTP_LAUNCH =
  "docker run --rm -i -e MDB_MCP_CONNECTION_STRING -e MDB_MCP_TRANSPORT=http -e MDB_MCP_HTTP_HOST=0.0.0.0 mongodb/mongodb-mcp-server:1.11.0";
