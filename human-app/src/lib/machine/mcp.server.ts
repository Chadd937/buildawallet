import { readJsonBody } from "@/lib/body";
import { PREPAID_BILLING, publicPlans } from "./config";
import { MACHINE_CHAINS } from "./chains";
import { handleMachineRequest } from "./router.server";

type RpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
};
const text = (data: unknown, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(data) }],
  structuredContent: typeof data === "object" && data ? data : { value: data },
  ...(isError ? { isError: true } : {}),
});
const schema = (required: string[], properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const tools = [
  {
    name: "service_quote",
    title: "BuildAWallet service quote",
    description: "Discover prepaid API plans without spending units.",
    inputSchema: schema([], {}),
  },
  {
    name: "api_usage",
    title: "API usage",
    description:
      "Check the caller's subscribed API quota. Requires a baw_acct_ or baw_live_ bearer API key.",
    inputSchema: schema([], {}),
  },
  ...MACHINE_CHAINS.flatMap((chain) => [
    {
      name: `${chain.id}_wallet`,
      title: `${chain.name} wallet`,
      description: `Read the live ${chain.symbol} balance for a public ${chain.name} mainnet address. Costs one subscribed API unit.`,
      inputSchema: schema(["address"], {
        address: { type: "string", description: "Public wallet address" },
      }),
    },
    ...(chain.stablecoin
      ? [
          {
            name: `${chain.id}_stablecoin`,
            title: `${chain.name} ${chain.stablecoin.symbol}`,
            description: `Read the configured ${chain.stablecoin.symbol} balance. Costs one subscribed API unit.`,
            inputSchema: schema(["address"], { address: { type: "string" } }),
          },
        ]
      : []),
    {
      name: `${chain.id}_transaction`,
      title: `${chain.name} transaction`,
      description: `Look up a public ${chain.name} transaction. Costs one subscribed API unit.`,
      inputSchema: schema(["tx"], { tx: { type: "string" } }),
    },
    {
      name: `${chain.id}_snapshot`,
      title: `${chain.name} snapshot`,
      description: `Read native${chain.stablecoin ? ` and ${chain.stablecoin.symbol}` : ""} balances. Costs one subscribed API unit.`,
      inputSchema: schema(["address"], { address: { type: "string" } }),
    },
  ]),
  {
    name: "portfolio",
    title: "Multichain portfolio (full query)",
    description:
      "Native and stablecoin balances on EVERY network that accepts the address (7 EVM chains for a 0x address), in one call. Costs one subscribed API unit.",
    inputSchema: schema(["address"], { address: { type: "string" } }),
  },
  {
    name: "wallet_local_kit",
    title: "Get a local agent wallet kit",
    description:
      "Returns install steps, derivation paths and a downloadable script that creates a multichain wallet on the agent's own machine. BuildAWallet never sees the keys. Free.",
    inputSchema: schema([], {}),
  },
  {
    name: "wallet_generate",
    title: "Server-made wallet (opt-in)",
    description:
      "Generate a fresh BIP-39 wallet covering all ten networks. The recovery phrase is returned ONCE and never stored. Requires acknowledgeCustodyRisk=true. Limited to 5 per hour. Prefer wallet_local_kit.",
    inputSchema: schema(["acknowledgeCustodyRisk"], {
      acknowledgeCustodyRisk: { type: "boolean", description: "Must be true" },
      words: { type: "integer", enum: [12, 24] },
    }),
  },
  {
    name: "wallet_validate",
    title: "Validate address",
    description:
      "List which of the ten networks accept a public address, with explorer links. Free.",
    inputSchema: schema(["address"], { address: { type: "string" } }),
  },
  {
    name: "list_chains",
    title: "Supported networks",
    description: "All ten networks with symbols, decimals and stablecoins. Free.",
    inputSchema: schema([], {}),
  },
  {
    name: "list_plans",
    title: "Subscription plans",
    description: "Plans, units, prices and USDC collector addresses. Free.",
    inputSchema: schema([], {}),
  },
  {
    name: "base_transaction_prepare",
    title: "Prepare Base transfer",
    description: "Build an unsigned Base native or USDC transfer for local signing. 1 unit.",
    inputSchema: schema(["from", "to", "asset", "amountAtomic"], {
      from: { type: "string" },
      to: { type: "string" },
      asset: { type: "string", enum: ["native", "usdc"] },
      amountAtomic: { type: "string" },
    }),
  },
  {
    name: "solana_transaction_prepare",
    title: "Prepare Solana transfer",
    description: "Build an unsigned Solana native or USDC transfer for local signing. 1 unit.",
    inputSchema: schema(["from", "to", "asset", "amountAtomic"], {
      from: { type: "string" },
      to: { type: "string" },
      asset: { type: "string", enum: ["native", "usdc"] },
      amountAtomic: { type: "string" },
    }),
  },
  {
    name: "base_transaction_broadcast",
    title: "Broadcast Base transaction",
    description: "Broadcast a 0x-hex transaction you signed locally. 1 unit.",
    inputSchema: schema(["signedTransaction"], { signedTransaction: { type: "string" } }),
  },
  {
    name: "solana_transaction_broadcast",
    title: "Broadcast Solana transaction",
    description: "Broadcast a base64 transaction you signed locally. 1 unit.",
    inputSchema: schema(["signedTransactionBase64"], {
      signedTransactionBase64: { type: "string" },
    }),
  },
];
async function invoke(request: Request, path: string, init?: { method: "POST"; body: unknown }) {
  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  if (init) headers.set("content-type", "application/json");
  const internal = new Request(
    `${new URL(request.url).origin}${path}`,
    init
      ? { method: "POST", headers, body: JSON.stringify(init.body) }
      : { method: "GET", headers },
  );
  const response = await handleMachineRequest(internal);
  const data = await response.json().catch(() => ({ error: "Machine API response unavailable" }));
  return text(data, !response.ok);
}
async function callTool(request: Request, name: string, args: Record<string, unknown>) {
  if (name === "service_quote")
    return text({
      billing: PREPAID_BILLING,
      plans: publicPlans(),
      settlement: ["Base USDC", "Solana USDC"],
      chains: MACHINE_CHAINS.map((chain) => chain.id),
    });
  if (name === "api_usage") return invoke(request, "/machine/v1/usage");
  if (name === "wallet_local_kit") return invoke(request, "/machine/v1/wallets/kit");
  if (name === "portfolio")
    return invoke(
      request,
      `/machine/v1/portfolio/${encodeURIComponent(String(args["address"] ?? ""))}`,
    );
  if (name === "list_chains") return invoke(request, "/machine/v1/chains");
  if (name === "list_plans") return invoke(request, "/machine/v1/plans");
  if (name === "wallet_generate")
    return invoke(request, "/machine/v1/wallets/generate", {
      method: "POST",
      body: {
        acknowledgeCustodyRisk: args["acknowledgeCustodyRisk"] === true,
        words: args["words"] === 24 ? 24 : 12,
      },
    });
  if (name === "wallet_validate")
    return invoke(request, "/machine/v1/wallets/validate", {
      method: "POST",
      body: { address: String(args["address"] ?? "") },
    });
  for (const chain of ["base", "solana"] as const) {
    if (name === `${chain}_transaction_prepare`)
      return invoke(request, `/machine/v1/${chain}/transaction/prepare`, {
        method: "POST",
        body: {
          from: args["from"],
          to: args["to"],
          asset: args["asset"],
          amountAtomic: args["amountAtomic"],
        },
      });
    if (name === `${chain}_transaction_broadcast`)
      return invoke(request, `/machine/v1/${chain}/transaction/broadcast`, {
        method: "POST",
        body:
          chain === "base"
            ? { signedTransaction: args["signedTransaction"] }
            : { signedTransactionBase64: args["signedTransactionBase64"] },
      });
  }
  if (name === "wallet_payg") return invoke(request, "/machine/x402/wallet");
  for (const chain of MACHINE_CHAINS)
    for (const kind of ["wallet", "stablecoin", "transaction", "snapshot"] as const) {
      if (name !== `${chain.id}_${kind}`) continue;
      const value = kind === "transaction" ? args["tx"] : args["address"];
      return invoke(
        request,
        `/machine/v1/${chain.id}/${kind}/${encodeURIComponent(String(value ?? ""))}`,
      );
    }
  return text({ error: "Unknown tool" }, true);
}
export async function handleMcp(request: Request) {
  if (request.method === "GET")
    return Response.json(
      { name: "buildawallet", protocol: "MCP Streamable HTTP", version: "2.0.0", endpoint: "/mcp" },
      { headers: { "access-control-allow-origin": "*" } },
    );
  if (request.method === "OPTIONS")
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,content-type,mcp-protocol-version",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
    });
  let rpc: RpcRequest;
  try {
    rpc = (await readJsonBody(request, 32_000)) as RpcRequest;
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  if (!rpc || rpc.jsonrpc !== "2.0")
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } },
      { status: 400 },
    );
  const result =
    rpc.method === "initialize"
      ? {
          protocolVersion: "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "buildawallet", version: "3.0.0" },
          instructions:
            "BuildAWallet: get a wallet (wallet_local_kit preferred), read ten mainnets, prepare/broadcast locally-signed transfers. Buy prepaid API units once, then use a bearer API key. Requests consume units in the backend without per-call blockchain payments.",
        }
      : rpc.method === "tools/list"
        ? { tools }
        : rpc.method === "tools/call" && rpc.params?.name
          ? await callTool(request, rpc.params.name, rpc.params.arguments ?? {})
          : rpc.method === "ping"
            ? {}
            : null;
  if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
  const payload =
    result === null
      ? { jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32601, message: "Method not found" } }
      : { jsonrpc: "2.0", id: rpc.id ?? null, result };
  return Response.json(payload, {
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
  });
}
