import { createHash } from "crypto";
import { deriveAccounts, newMnemonic, PATHS, publicAddresses } from "@/lib/wallet/derive";
import { MACHINE_CHAINS, validAddress } from "./chains";
import { cors, json, objectBody } from "./http";
import { AGENT_KIT_SOURCE, kitManifest } from "./agent-kit";

const SECRET_HEADERS = { ...cors, "cache-control": "no-store, max-age=0", pragma: "no-cache", "x-content-type-options": "nosniff" };

function clientBucket(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `wallet-generate:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

async function allowGenerate(request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("hit_api_rate_limit", { p_bucket: clientBucket(request), p_limit: 5, p_window_seconds: 3600 });
  if (error) throw new Error("Rate limiter unavailable");
  return data === true;
}


/** Handles /machine/v1/wallets/*. Returns null when the path is not a wallet route. */
export async function handleWalletRoute(request: Request, rest: string[]): Promise<Response | null> {
  const path = rest.join("/");
  if (request.method === "GET" && path === "kit") return json(kitManifest(), 200, cors);
  if (request.method === "GET" && path === "kit.mjs") {
    return new Response(AGENT_KIT_SOURCE, { headers: { ...cors, "content-type": "text/javascript; charset=utf-8", "content-disposition": 'attachment; filename="baw-agent-wallet.mjs"', "cache-control": "public, max-age=300" } });
  }
  if (request.method === "POST" && path === "validate") {
    const body = await objectBody(request), address = body["address"];
    if (typeof address !== "string" || address.length > 128) throw new RangeError("address required");
    const valid = MACHINE_CHAINS.filter((chain) => validAddress(chain, address.trim()));
    return json({ address: address.trim(), validOn: valid.map((c) => c.id), explorers: Object.fromEntries(valid.map((c) => [c.id, `${c.explorer}/${c.family === "bitcoin" ? "address" : c.family === "tron" ? "#/address" : c.family === "solana" ? "account" : "address"}/${address.trim()}`])) }, 200, cors);
  }
  if (request.method === "POST" && path === "generate") {
    const body = await objectBody(request);
    if (body["acknowledgeCustodyRisk"] !== true) {
      return json({ error: "Set acknowledgeCustodyRisk: true to accept that the phrase briefly exists on BuildAWallet servers. Prefer the local kit at /machine/v1/wallets/kit.", localKit: "/machine/v1/wallets/kit" }, 400, cors);
    }
    const words = body["words"] === 24 ? 24 : 12;
    const chains = MACHINE_CHAINS;
    if (!(await allowGenerate(request))) return json({ error: "Limit reached: 5 server-made wallets per hour. Use the local kit for unlimited wallets." }, 429, { ...cors, "retry-after": "3600" });
    const mnemonic = newMnemonic(words === 24 ? 256 : 128);
    const addresses = publicAddresses(deriveAccounts(mnemonic));
    return json({
      mnemonic,
      words,
      addresses: Object.fromEntries(chains.map((chain) => [chain.id, addresses[chain.family]])),
      derivationPaths: PATHS,
      stored: false,
      warning: "Shown once. BuildAWallet keeps no copy. Save the phrase in your own secret store now ,  anyone holding it controls the funds.",
    }, 201, SECRET_HEADERS);
  }
  return null;
}
