import { createHash, randomBytes } from "crypto";
import { planById, type PlanId } from "./config";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const secretToken = () => randomBytes(32).toString("hex");
export const bearer = (request: Request, pattern: RegExp) => pattern.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
export async function issueChallenge(chain: "base" | "solana", wallet: string) {
  const nonce = secretToken(), issued = new Date(), expires = new Date(issued.getTime() + 5 * 60_000);
  const { error } = await (await admin()).from("machine_challenges").insert({ nonce, chain, wallet, issued_at: issued.toISOString(), expires_at: expires.toISOString() });
  if (error) throw new Error("Challenge storage unavailable");
  const message = `BuildAWallet.xyz machine API login\nChain: ${chain}\nWallet: ${wallet}\nNonce: ${nonce}\nIssued: ${Math.floor(issued.getTime() / 1000)}\n\nSigning proves wallet control. It does not authorize a payment or transaction.`;
  return { nonce, message, expiresAt: expires.toISOString() };
}
export async function challenge(nonce: string) {
  const db = await admin();
  const { data } = await db.from("machine_challenges").select("chain,wallet,issued_at,expires_at,consumed_at").eq("nonce", nonce).maybeSingle();
  if (!data || data.consumed_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data;
}
export async function createSession(nonce: string, chain: "base" | "solana", wallet: string) {
  const token = secretToken(), expires = new Date(Date.now() + 30 * 24 * 60 * 60_000), db = await admin();
  const { data: consumed, error: consumeError } = await db.from("machine_challenges").update({ consumed_at: new Date().toISOString() }).eq("nonce", nonce).is("consumed_at", null).gt("expires_at", new Date().toISOString()).select("nonce").maybeSingle();
  if (consumeError || !consumed) throw new RangeError("Challenge is invalid, expired or already consumed");
  const { error } = await db.from("machine_sessions").insert({ token_hash: sha256(token), chain, wallet, expires_at: expires.toISOString() });
  if (error) throw new Error("Session storage unavailable");
  return { accessToken: token, chain, wallet, expiresAt: expires.toISOString() };
}
export async function session(request: Request) {
  const token = bearer(request, /^Bearer ([0-9a-f]{64})$/); if (!token) return null;
  const { data } = await (await admin()).from("machine_sessions").select("chain,wallet,issued_at,expires_at").eq("token_hash", sha256(token)).gt("expires_at", new Date().toISOString()).maybeSingle();
  return data;
}
export async function consumeApiKey(request: Request, cost: number, meta: { endpoint?: string; chain?: string } = {}) {
  const accountToken = bearer(request, /^Bearer (baw_acct_[0-9a-f]{64})$/);
  if (accountToken) {
    const { data, error } = await (await admin()).rpc("consume_account_api_units", { p_token_hash: sha256(accountToken), p_cost: cost, p_endpoint: meta.endpoint ?? new URL(request.url).pathname, p_chain: meta.chain ?? "" });
    if (error) throw new Error("Usage storage unavailable");
    return data?.[0] ?? null;
  }
  const token = bearer(request, /^Bearer (baw_live_[0-9a-f]{64})$/); if (!token) return null;
  const { data, error } = await (await admin()).rpc("consume_machine_api_units_v2", { p_token_hash: sha256(token), p_cost: cost });
  if (error) throw new Error("Usage storage unavailable");
  return data?.[0] ?? null;
}
/** Account checkout tx hashes must never collide with wallet-session payments. */
export async function txAlreadyUsed(chain: string, tx: string) {
  const db = await admin();
  const [a, b] = await Promise.all([
    db.from("machine_payments").select("id").eq("chain", chain).eq("tx", tx).maybeSingle(),
    db.from("api_account_payments").select("id").eq("chain", chain).eq("tx", tx).maybeSingle(),
  ]);
  return Boolean(a.data || b.data);
}
export async function statusForSession(request: Request) {
  const identity = await session(request); if (!identity) return null; const db = await admin();
  const [{ data: entitlement }, { data: key }] = await Promise.all([
    db.from("machine_entitlements").select("plan_id,expires_at").eq("chain", identity.chain).eq("wallet", identity.wallet).maybeSingle(),
    db.from("machine_api_keys").select("created_at").eq("chain", identity.chain).eq("wallet", identity.wallet).maybeSingle(),
  ]);
  return { ...identity, active: Boolean(entitlement && new Date(entitlement.expires_at).getTime() > Date.now()), plan: entitlement?.plan_id ?? null, planExpiresAt: entitlement?.expires_at ?? null, apiKeyCreated: Boolean(key) };
}
export async function confirmPayment(request: Request, tx: string, planId: PlanId, paidAt: number, amountAtomic: bigint) {
  const identity = await session(request); if (!identity) return null; const plan = planById(planId); if (!plan || plan.amountAtomic !== amountAtomic) throw new Error("Plan amount mismatch");
  const db = await admin();
  if (await txAlreadyUsed(identity.chain, tx)) throw new RangeError("Transaction has already been used");
  const { data, error } = await db.rpc("activate_machine_payment", {
    p_chain: identity.chain, p_wallet: identity.wallet, p_plan: planId,
    p_tx: tx, p_paid_at: new Date(paidAt * 1000).toISOString(), p_amount: Number(amountAtomic),
  });
  if (error || !data) throw new RangeError("Payment could not be activated or has already been used");
  return data;

}
export async function issueApiKey(request: Request) {
  const identity = await session(request); if (!identity) return null; const db = await admin();
  const { data: entitlement } = await db.from("machine_entitlements").select("expires_at").eq("chain", identity.chain).eq("wallet", identity.wallet).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!entitlement) throw new RangeError("An active plan is required");
  const apiKey = `baw_live_${secretToken()}`;
  const { error } = await db.from("machine_api_keys").upsert({ chain: identity.chain, wallet: identity.wallet, token_hash: sha256(apiKey), created_at: new Date().toISOString() });
  if (error) throw new Error("API key storage unavailable"); return { apiKey, message: "Copy this key now. Creating another key revokes the previous key." };
}
export async function revokeApiKey(request: Request) {
  const identity = await session(request); if (!identity) return null;
  await (await admin()).from("machine_api_keys").delete().eq("chain", identity.chain).eq("wallet", identity.wallet);
  return { revoked: true };
}
