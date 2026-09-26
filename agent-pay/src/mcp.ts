import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Env } from "./index";

// Each request receives its own server. Calls share the REST authentication and D1 meter.
export async function handleMcp(request: Request, env: Env, forward: (request: Request) => Promise<Response>) {
  const server = new McpServer({ name: "buildawallet", version: "1.0.0" });
  const invoke = async (path: string) => {
    const response = await forward(new Request(`https://buildawallet.xyz/machine/v1/${path}`, {
      headers: { Authorization: request.headers.get("Authorization") ?? "" },
    }));
    const data = await response.json();
    return { isError: !response.ok, content: [{ type: "text" as const, text: JSON.stringify(data) }] };
  };
  for (const chain of ["base", "solana"] as const) {
    server.registerTool(`${chain}_wallet`, { title: `${chain} wallet`,
      description: `Read native balance and chain progress on ${chain} mainnet. Costs one subscribed API unit.`,
      inputSchema: { address: z.string().describe("Public wallet address") } },
      ({ address }) => invoke(`${chain}/wallet/${encodeURIComponent(address)}`));
    server.registerTool(`${chain}_usdc`, { title: `${chain} USDC balance`,
      description: `Read native USDC balance for a public ${chain} wallet. Costs one subscribed API unit.`,
      inputSchema: { address: z.string().describe("Public wallet address") } },
      ({ address }) => invoke(`${chain}/usdc/${encodeURIComponent(address)}`));
    server.registerTool(`${chain}_transaction`, { title: `${chain} transaction status`,
      description: `Look up a public ${chain} transaction status. Costs one subscribed API unit.`,
      inputSchema: { tx: z.string().describe("Transaction hash or signature") } },
      ({ tx }) => invoke(`${chain}/transaction/${encodeURIComponent(tx)}`));
  }
  const handler = createMcpHandler(() => server, { route: "/mcp", corsOptions: false,
    allowedHostnames: ["buildawallet.xyz", "localhost", "127.0.0.1"] });
  return handler.fetch(request);
}
