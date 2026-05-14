import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ListToolsResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { listMcpToolNamesFromClient } from "./mcp-client.js";

describe("listMcpToolNamesFromClient", () => {
  it("collects paginated MCP tool names up to the requested limit", async () => {
    const client = new Client({ name: "bazaarlens-test-client", version: "0.1.0" });
    const listTools = vi.spyOn(client, "listTools").mockImplementation(async (params) =>
      params?.cursor === "page-2"
        ? toolsPage(["second", "third"], "page-3")
        : params?.cursor === "page-3"
          ? toolsPage(["fourth"])
          : toolsPage(["first"], "page-2"),
    );

    const names = await listMcpToolNamesFromClient(client, 3, 7_000);

    expect(names).toEqual(["first", "second", "third"]);
    expect(listTools).toHaveBeenNthCalledWith(1, undefined, { timeout: 7_000 });
    expect(listTools).toHaveBeenNthCalledWith(2, { cursor: "page-2" }, { timeout: 7_000 });
  });
});

function toolsPage(names: string[], nextCursor?: string): ListToolsResult {
  return {
    tools: names.map(tool),
    ...(nextCursor ? { nextCursor } : {}),
  };
}

function tool(name: string): Tool {
  return {
    name,
    inputSchema: { type: "object" },
  };
}
