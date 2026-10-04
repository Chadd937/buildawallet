import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Solana mainnet JSON-RPC relay. Public Solana endpoints frequently reject
 * browser origins, so read/broadcast calls are relayed server-side.
 * Only a fixed allowlist of non-privileged methods is forwarded.
 */
const ALLOWED = new Set([
  "getBalance",
  "getLatestBlockhash",
  "getTokenAccountsByOwner",
  "getSignaturesForAddress",
  "sendTransaction",
  "getSignatureStatuses",
  "getFeeForMessage",
  "getAccountInfo",
]);

export const solanaRpc = createServerFn({ method: "POST" })
  .validator((d) =>
    z.object({ method: z.string().max(64), params: z.array(z.unknown()).max(8) }).parse(d),
  )
  .handler(async ({ data }) => {
    if (!ALLOWED.has(data.method)) throw new Error("Method not allowed");
    const endpoints = [
      process.env["SOLANA_RPC_URL"],
      "https://solana-rpc.publicnode.com",
      "https://api.mainnet-beta.solana.com",
    ].filter(Boolean) as string[];
    let lastErr = "No Solana RPC reachable";
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: data.method, params: data.params }),
        });
        if (!res.ok) {
          lastErr = `Solana RPC ${res.status}`;
          continue;
        }
        const json = (await res.json()) as { result?: unknown; error?: { message: string } };
        if (json.error) return { error: json.error.message as string | null, json: "null" };
        return { error: null as string | null, json: JSON.stringify(json.result ?? null) };
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    throw new Error(lastErr);
  });
