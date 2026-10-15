export const BASE_CHAIN_ID = "0x2105";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_QUANTITY = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;

export function validAddress(address: string | undefined): address is string {
  return typeof address === "string" && ADDRESS.test(address);
}

// Public mainnet read fallbacks. Every candidate must confirm Base chain ID 8453.
// The official Base RPC is rate-limited; preserve the configured endpoint as first choice.
const FREE_BASE_RPC_FALLBACKS = [
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://base.llamarpc.com",
] as const;

async function rpc(url: string, method: string, params: unknown[]): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(method + ":rpc_http_" + response.status);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("result" in data) ||
      typeof data.result !== "string" || !HEX_QUANTITY.test(data.result)) {
    throw new Error(method + ":rpc_invalid_response");
  }
  return data.result;
}

export async function checkBaseRpc(url: string): Promise<void> {
  const chainId = await rpc(url, "eth_chainId", []);
  if (BigInt(chainId) !== BigInt(BASE_CHAIN_ID)) throw new Error("RPC network mismatch");
}

export async function walletSnapshot(url: string, address: string) {
  // Keep configured/private endpoints first, and never infer that a failed RPC means zero balance.
  const endpoints = [...new Set([url, ...FREE_BASE_RPC_FALLBACKS])];
  let mismatchedNetworks = 0;
  const diagnostics: string[] = [];
  for (const [index, endpoint] of endpoints.entries()) {
    try {
      await checkBaseRpc(endpoint);
      const [balanceHex, nonceHex, blockHex] = await Promise.all([
        rpc(endpoint, "eth_getBalance", [address, "latest"]),
        rpc(endpoint, "eth_getTransactionCount", [address, "latest"]),
        rpc(endpoint, "eth_blockNumber", []),
      ]);
      const wei = BigInt(balanceHex);
      const whole = wei / 10n ** 18n;
      const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
      return {
        chain: "base",
        chainId: 8453,
        address,
        balanceWei: wei.toString(),
        balanceEth: fraction ? `${whole}.${fraction}` : whole.toString(),
        transactionCount: Number(BigInt(nonceHex)),
        blockNumber: Number(BigInt(blockHex)),
        source: "verified Base mainnet JSON-RPC",
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (reason === "RPC network mismatch") mismatchedNetworks++;
      // Only log known-safe codes/methods; never reveal configured RPC URLs or tokens.
      const safe = reason === "RPC network mismatch" ? "wrong_network"
        : /^(?:eth_chainId|eth_getBalance|eth_getTransactionCount|eth_blockNumber):rpc_http_\d{3}$/.test(reason) ? reason
        : /^(?:eth_chainId|eth_getBalance|eth_getTransactionCount|eth_blockNumber):rpc_invalid_response$/.test(reason) ? reason
        : "connection_or_timeout";
      diagnostics.push("provider_" + (index + 1) + ":" + safe);
    }
  }
  if (mismatchedNetworks === endpoints.length) throw new Error("RPC network mismatch");
  console.warn("Base paid RPC read failed", diagnostics.join(" | "));
  throw new Error("Base RPC unavailable");
}
