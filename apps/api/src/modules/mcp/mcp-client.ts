import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface McpClientConfig {
  readonly name: string;
  readonly version?: string;
  readonly httpUrl?: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs?: number;
}

export async function connectMcpClient(config: McpClientConfig): Promise<Client> {
  const client = new Client({ name: config.name, version: config.version ?? "0.1.0" });
  await client.connect(createMcpTransport(config), { timeout: config.timeoutMs ?? 15_000 });
  return client;
}

export async function listMcpToolNames(config: McpClientConfig, maxTools = 20): Promise<string[]> {
  const client = await connectMcpClient(config);
  try {
    return await listMcpToolNamesFromClient(client, maxTools, config.timeoutMs ?? 15_000);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function listMcpToolNamesFromClient(client: Client, maxTools = 20, timeoutMs = 15_000): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: timeoutMs });
    names.push(...page.tools.map((tool) => tool.name));
    cursor = page.nextCursor;
  } while (cursor && names.length < maxTools);
  return names.slice(0, maxTools);
}

export function splitMcpArgs(value: string): string[] {
  return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((arg) => arg.replace(/^"|"$/g, "")) ?? [];
}

function createMcpTransport(config: McpClientConfig): StreamableHTTPClientTransport | StdioClientTransport {
  if (config.httpUrl) {
    return new StreamableHTTPClientTransport(new URL(config.httpUrl), {
      requestInit: { headers: definedEnv(config.headers ?? {}) },
    });
  }

  if (!config.command) throw new Error("MCP command or HTTP URL is required");
  return new StdioClientTransport({
    command: config.command,
    args: [...(config.args ?? [])],
    env: {
      ...getDefaultEnvironment(),
      ...definedEnv(config.env ?? {}),
    },
    stderr: "pipe",
  });
}

function definedEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
