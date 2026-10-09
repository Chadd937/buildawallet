/** Client-safe description of every machine endpoint, used by docs pages and the OpenAPI spec. */
export type EndpointDoc = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  auth: "none" | "api-key" | "session";
  units: number;
  summary: string;
  tag: string;
};

export const ENDPOINTS: readonly EndpointDoc[] = [
  {
    method: "GET",
    path: "/machine/v1/chains",
    auth: "none",
    units: 0,
    tag: "Discovery",
    summary: "List all nine configured networks with symbols, decimals and stablecoins.",
  },
  {
    method: "GET",
    path: "/machine/v1/plans",
    auth: "none",
    units: 0,
    tag: "Discovery",
    summary: "Prepaid API plans, payment assets and collector addresses for every supported payment network.",
  },
  {
    method: "GET",
    path: "/machine/v1/wallets/kit",
    auth: "none",
    units: 0,
    tag: "Agent wallets",
    summary: "Local wallet kit manifest: install, derivation paths, next steps.",
  },
  {
    method: "GET",
    path: "/machine/v1/wallets/kit.mjs",
    auth: "none",
    units: 0,
    tag: "Agent wallets",
    summary: "Download the self-contained local wallet script.",
  },
  {
    method: "POST",
    path: "/machine/v1/wallets/validate",
    auth: "none",
    units: 0,
    tag: "Agent wallets",
    summary: "Check which networks accept a public address.",
  },
  {
    method: "POST",
    path: "/machine/v1/wallets/generate",
    auth: "none",
    units: 0,
    tag: "Agent wallets",
    summary:
      "Opt-in server-made wallet covering all nine configured networks. Returns the phrase once; nothing stored. 5 per hour.",
  },
  {
    method: "GET",
    path: "/machine/v1/usage",
    auth: "api-key",
    units: 0,
    tag: "Subscribed API",
    summary: "Plan, units used and remaining for the presented API key.",
  },
  {
    method: "GET",
    path: "/machine/v1/{chain}/wallet/{address}",
    auth: "api-key",
    units: 1,
    tag: "Subscribed API",
    summary: "Live native balance on any of the nine configured networks.",
  },
  {
    method: "GET",
    path: "/machine/v1/{chain}/stablecoin/{address}",
    auth: "api-key",
    units: 1,
    tag: "Subscribed API",
    summary: "Canonical stablecoin balance (USDC).",
  },
  {
    method: "GET",
    path: "/machine/v1/{chain}/transaction/{tx}",
    auth: "api-key",
    units: 1,
    tag: "Subscribed API",
    summary: "Transaction status and confirmation details.",
  },
  {
    method: "GET",
    path: "/machine/v1/{chain}/snapshot/{address}",
    auth: "api-key",
    units: 1,
    tag: "Subscribed API",
    summary: "Native and stablecoin balances in one call.",
  },
  {
    method: "GET",
    path: "/machine/v1/portfolio/{address}",
    auth: "api-key",
    units: 1,
    tag: "Subscribed API",
    summary: "Full query: native + stablecoin on every network that accepts the address, one unit.",
  },
  {
    method: "POST",
    path: "/machine/v1/{chain}/transaction/prepare",
    auth: "api-key",
    units: 1,
    tag: "Transactions",
    summary: "Build an unsigned transfer for any configured EVM mainnet or Solana. Bitcoin transaction preparation is not implemented.",
  },
  {
    method: "POST",
    path: "/machine/v1/{chain}/transaction/broadcast",
    auth: "api-key",
    units: 1,
    tag: "Transactions",
    summary:
      "Broadcast locally signed EVM or Solana bytes on configured transaction networks. Bitcoin broadcast is not implemented. One unit is reserved per attempt before dispatch, including upstream rejection.",
  },
  {
    method: "POST",
    path: "/machine/v1/auth/challenge",
    auth: "none",
    units: 0,
    tag: "Wallet subscription",
    summary: "Get a one-use message to sign with a supported subscription wallet (Base or Solana).",
  },
  {
    method: "POST",
    path: "/machine/v1/auth/verify",
    auth: "none",
    units: 0,
    tag: "Wallet subscription",
    summary: "Submit the signature; receive a 30-day session token.",
  },
  {
    method: "GET",
    path: "/machine/v1/subscription",
    auth: "session",
    units: 0,
    tag: "Wallet subscription",
    summary: "Session plan status.",
  },
  {
    method: "POST",
    path: "/machine/v1/subscription/confirm",
    auth: "session",
    units: 0,
    tag: "Wallet subscription",
    summary: "Submit the exact quoted payment transaction to activate a plan.",
  },
  {
    method: "POST",
    path: "/machine/v1/subscription/key",
    auth: "session",
    units: 0,
    tag: "Wallet subscription",
    summary: "Mint a baw_live_ API key (replaces the previous one).",
  },
  {
    method: "DELETE",
    path: "/machine/v1/subscription/key",
    auth: "session",
    units: 0,
    tag: "Wallet subscription",
    summary: "Revoke the wallet's API key.",
  },
] as const;

export const MCP_CLIENTS = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    file: "claude_desktop_config.json",
    config: (url: string) =>
      JSON.stringify(
        {
          mcpServers: {
            buildawallet: {
              command: "npx",
              args: ["-y", "mcp-remote", url, "--header", "Authorization:Bearer ${BAW_API_KEY}"],
              env: { BAW_API_KEY: "baw_acct_…" },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "claude-code",
    name: "Claude Code",
    file: "terminal",
    config: (url: string) =>
      `claude mcp add --transport http buildawallet ${url} \\\n  --header "Authorization: Bearer $BAW_API_KEY"`,
  },
  {
    id: "cursor",
    name: "Cursor",
    file: ".cursor/mcp.json",
    config: (url: string) =>
      JSON.stringify(
        {
          mcpServers: {
            buildawallet: { url, headers: { Authorization: "Bearer ${env:BAW_API_KEY}" } },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "openai",
    name: "OpenAI Agents SDK",
    file: "agent.py",
    config: (url: string) =>
      `from agents import Agent\nfrom agents.mcp import MCPServerStreamableHttp\n\nbaw = MCPServerStreamableHttp(params={\n    "url": "${url}",\n    "headers": {"Authorization": f"Bearer {os.environ['BAW_API_KEY']}"},\n})\nagent = Agent(name="treasurer", mcp_servers=[baw])`,
  },
  {
    id: "raw",
    name: "Any client (JSON-RPC)",
    file: "curl",
    config: (url: string) =>
      `curl -s ${url} -H 'content-type: application/json' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  },
] as const;
