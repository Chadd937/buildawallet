import { createHash, randomBytes } from "node:crypto";
import { appDatabase } from "@/lib/db/context.server";
import { activateWalletPayment, consumeUnits } from "@/lib/db/storage.server";
import { planById, type PlanId, paymentCollector } from "./config";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const secretToken = () => randomBytes(32).toString("hex");
export const bearer = (request: Request, pattern: RegExp) =>
  pattern.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
type Challenge = {
  chain: string;
  wallet: string;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
};
type Session = { chain: string; wallet: string; issued_at: string; expires_at: string };
const now = () => new Date().toISOString();

export async function issueChallenge(chain: "base" | "solana", wallet: string) {
  const nonce = secretToken(),
    issued = new Date(),
    expires = new Date(issued.getTime() + 5 * 60_000);
  await appDatabase()
    .prepare(
      "INSERT INTO machine_challenges(nonce,chain,wallet,issued_at,expires_at) VALUES(?,?,?,?,?)",
    )
    .bind(nonce, chain, wallet, issued.toISOString(), expires.toISOString())
    .run();
  const message = `BuildAWallet.xyz machine API login\nChain: ${chain}\nWallet: ${wallet}\nNonce: ${nonce}\nIssued: ${Math.floor(issued.getTime() / 1000)}\n\nSigning proves wallet control. It does not authorize a payment or transaction.`;
  return { nonce, message, expiresAt: expires.toISOString() };
}
export async function challenge(nonce: string) {
  return appDatabase()
    .prepare(
      "SELECT chain,wallet,issued_at,expires_at,consumed_at FROM machine_challenges WHERE nonce=? AND consumed_at IS NULL AND expires_at>?",
    )
    .bind(nonce, now())
    .first<Challenge>();
}
export async function createSession(nonce: string, chain: "base" | "solana", wallet: string) {
  const token = secretToken(),
    tokenHash = sha256(token),
    issuedAt = now(),
    expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString(),
    db = appDatabase();
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO machine_sessions(token_hash,chain,wallet,issued_at,expires_at)
      SELECT ?,chain,wallet,?,? FROM machine_challenges WHERE nonce=? AND chain=? AND wallet=? AND consumed_at IS NULL AND expires_at>? RETURNING token_hash`,
      )
      .bind(tokenHash, issuedAt, expiresAt, nonce, chain, wallet, issuedAt),
    db
      .prepare(
        "UPDATE machine_challenges SET consumed_at=? WHERE nonce=? AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM machine_sessions WHERE token_hash=?)",
      )
      .bind(issuedAt, nonce, issuedAt, tokenHash),
  ]);
  if (!result[0]?.results.length)
    throw new RangeError("Challenge is invalid, expired or already consumed");
  return { accessToken: token, chain, wallet, expiresAt };
}
export async function session(request: Request) {
  const token = bearer(request, /^Bearer ([0-9a-f]{64})$/);
  if (!token) return null;
  return appDatabase()
    .prepare(
      "SELECT chain,wallet,issued_at,expires_at FROM machine_sessions WHERE token_hash=? AND expires_at>?",
    )
    .bind(sha256(token), now())
    .first<Session>();
}
export async function consumeApiKey(
  request: Request,
  cost: number,
  meta: { endpoint?: string; chain?: string } = {},
) {
  const accountToken = bearer(request, /^Bearer (baw_acct_[0-9a-f]{64})$/);
  const walletToken = bearer(request, /^Bearer (baw_live_[0-9a-f]{64})$/);
  const token = accountToken ?? walletToken;
  if (!token) return null;
  return consumeUnits(
    accountToken ? "account" : "wallet",
    sha256(token),
    cost,
    meta.endpoint ?? new URL(request.url).pathname,
    meta.chain ?? "",
  );
}
export async function txAlreadyUsed(chain: string, tx: string) {
  const row = await appDatabase()
    .prepare("SELECT 1 FROM api_payment_redemptions WHERE chain=? AND tx=?")
    .bind(chain, chain === "base" ? tx.toLowerCase() : tx)
    .first();
  return Boolean(row);
}
export async function statusForSession(request: Request) {
  const identity = await session(request);
  if (!identity) return null;
  const db = appDatabase();
  const result = await db.batch([
    db
      .prepare("SELECT plan_id,expires_at FROM machine_entitlements WHERE chain=? AND wallet=?")
      .bind(identity.chain, identity.wallet),
    db
      .prepare("SELECT created_at FROM machine_api_keys WHERE chain=? AND wallet=?")
      .bind(identity.chain, identity.wallet),
  ]);
  const entitlement = result[0]?.results[0] as { plan_id: string; expires_at: string } | undefined;
  return {
    ...identity,
    active: Boolean(entitlement && new Date(entitlement.expires_at).getTime() > Date.now()),
    plan: entitlement?.plan_id ?? null,
    planExpiresAt: entitlement?.expires_at ?? null,
    apiKeyCreated: Boolean(result[1]?.results.length),
  };
}
export async function confirmPayment(
  request: Request,
  tx: string,
  planId: PlanId,
  paidAt: number,
  amountAtomic: bigint,
) {
  const identity = await session(request);
  if (!identity) return null;
  const plan = planById(planId);
  if (!plan || plan.amountAtomic !== amountAtomic) throw new Error("Plan amount mismatch");
  try {
    return await activateWalletPayment(
      identity.chain,
      identity.wallet,
      planId,
      tx,
      new Date(paidAt * 1000).toISOString(),
      amountAtomic,
    );
  } catch {
    throw new RangeError("Payment could not be activated or has already been used");
  }
}
export async function issueApiKey(request: Request) {
  const identity = await session(request);
  if (!identity) return null;
  const db = appDatabase();
  const apiKey = `baw_live_${secretToken()}`;
  const result = await db
    .prepare(
      `INSERT INTO machine_api_keys(chain,wallet,token_hash,created_at)
    SELECT chain,wallet,?,? FROM machine_entitlements WHERE chain=? AND wallet=? AND expires_at>?
    ON CONFLICT(chain,wallet) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at RETURNING token_hash`,
    )
    .bind(sha256(apiKey), now(), identity.chain, identity.wallet, now())
    .all();
  if (!result.results.length) throw new RangeError("An active plan is required");
  return { apiKey, message: "Copy this key now. Creating another key revokes the previous key." };
}
export async function revokeApiKey(request: Request) {
  const identity = await session(request);
  if (!identity) return null;
  await appDatabase()
    .prepare("DELETE FROM machine_api_keys WHERE chain=? AND wallet=?")
    .bind(identity.chain, identity.wallet)
    .run();
  return { revoked: true };
}


export async function createMachineAccessQuote(
  chain: "base" | "solana",
  wallet: string,
  planId: PlanId,
) {
  const plan = planById(planId);
  if (!plan) throw new RangeError("Unknown plan");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const id = crypto.randomUUID();
  await appDatabase()
    .prepare(
      "INSERT INTO machine_access_quotes(id,chain,wallet,plan_id,amount_atomic,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(id, chain, wallet, planId, String(plan.amountAtomic), createdAt, expiresAt)
    .run();
  return {
    quoteId: id,
    chain,
    wallet,
    plan: { id: plan.id, name: plan.name, priceUSDC: plan.priceUSDC, units: plan.units },
    amountAtomic: String(plan.amountAtomic),
    asset: chain === "base" ? "USDC" : "USDC",
    collector: paymentCollector(chain),
    expiresAt,
    activate: "/machine/v1/agent/activate",
  };
}

export async function machineAccessQuote(id: string) {
  return appDatabase()
    .prepare(
      "SELECT id,chain,wallet,plan_id,amount_atomic,created_at,expires_at,consumed_at FROM machine_access_quotes WHERE id=? AND consumed_at IS NULL AND expires_at>?",
    )
    .bind(id, now())
    .first<{
      id: string;
      chain: "base" | "solana";
      wallet: string;
      plan_id: PlanId;
      amount_atomic: string;
      created_at: string;
      expires_at: string;
      consumed_at: string | null;
    }>();
}

export async function activateMachineAccessQuote(quoteId: string, tx: string, paidAt: number) {
  const quote = await machineAccessQuote(quoteId);
  if (!quote) throw new RangeError("Quote is invalid, expired or already consumed");
  const plan = planById(quote.plan_id);
  if (!plan || String(plan.amountAtomic) !== quote.amount_atomic)
    throw new RangeError("Quote amount no longer matches the active plan");

  const normalizedTx = quote.chain === "base" ? tx.toLowerCase() : tx;
  const activated = await activateWalletPayment(
    quote.chain,
    quote.wallet,
    quote.plan_id,
    normalizedTx,
    new Date(paidAt * 1000).toISOString(),
    plan.amountAtomic,
  );

  await appDatabase()
    .prepare("UPDATE machine_access_quotes SET consumed_at=? WHERE id=? AND consumed_at IS NULL")
    .bind(now(), quoteId)
    .run();

  const apiKey = `baw_live_${secretToken()}`;
  await appDatabase()
    .prepare(
      `INSERT INTO machine_api_keys(chain,wallet,token_hash,created_at)
       VALUES(?,?,?,?,?)`.replace("VALUES(?,?,?,?,?)", "VALUES(?,?,?,?)") +
      " ON CONFLICT(chain,wallet) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at",
    )
    .bind(quote.chain, quote.wallet, sha256(apiKey), now())
    .run();

  return { ...activated, apiKey };
}
