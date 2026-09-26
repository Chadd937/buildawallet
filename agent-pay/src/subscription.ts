import { Hono } from "hono";
import { verifyMessage } from "viem";
import { PendingReceipt, PRICE_ATOMIC, verifyBaseReceipt, verifySolanaReceipt } from "./receipts";
import { BASE_COLLECTOR, SOLANA_COLLECTOR } from "./index";

type Chain = "base" | "solana";
export interface HumanEnv {
  DB?: D1Database;
  HUMAN_API?: { fetch(request: Request): Promise<Response> };
  BASE_RPC_URL?: string;
  SOLANA_RPC_URL?: string;
  REQUEST_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}
const human = new Hono<{ Bindings: HumanEnv }>();
const MONTH = 30 * 24 * 60 * 60;
const SOLANA_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const now = () => Math.floor(Date.now() / 1000);
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const json = (c: any, data: object, status = 200) => c.json(data, status, { "Cache-Control": "no-store" });

function decode58(value: string): Uint8Array {
  let integer = 0n;
  for (const char of value) {
    const digit = SOLANA_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error("Invalid Solana address");
    integer = integer * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (integer > 0n) { bytes.unshift(Number(integer & 255n)); integer >>= 8n; }
  return new Uint8Array([...Array(value.match(/^1*/)?.[0].length ?? 0).fill(0), ...bytes]);
}

export function normalizedWallet(chain: unknown, address: unknown): string | null {
  if (chain === "base" && typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address)) return address.toLowerCase();
  if (chain === "solana" && typeof address === "string") {
    try { if (decode58(address).length === 32) return address; } catch { /* invalid */ }
  }
  return null;
}

export function challengeMessage(chain: Chain, wallet: string, nonce: string, issued: number): string {
  return `BuildAWallet.xyz premium blueprint login\nChain: ${chain}\nWallet: ${wallet}\nNonce: ${nonce}\nIssued: ${issued}\n\nSigning proves wallet control. It does not authorize a payment or transaction.`;
}

async function verifySignature(chain: Chain, wallet: string, message: string, signature: string): Promise<boolean> {
  try {
    if (chain === "base") return /^0x[0-9a-fA-F]{130}$/.test(signature) && await verifyMessage({
      address: wallet as `0x${string}`, message, signature: signature as `0x${string}`,
    });
    const publicKey = await crypto.subtle.importKey("raw", decode58(wallet).buffer as ArrayBuffer, "Ed25519", false, ["verify"]);
    const bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    return bytes.length === 64 && await crypto.subtle.verify("Ed25519", publicKey, bytes.buffer as ArrayBuffer, new TextEncoder().encode(message));
  } catch { return false; }
}

async function session(c: any): Promise<{ chain: Chain; wallet: string; issued_at: number } | null> {
  const match = /^Bearer ([0-9a-f]{64})$/.exec(c.req.header("Authorization") ?? "");
  if (!match || !c.env.DB) return null;
  return await c.env.DB.prepare(
    "SELECT chain,wallet,issued_at FROM human_sessions WHERE token_hash=? AND expires_at>?"
  ).bind(await hash(match[1]), now()).first() as { chain: Chain; wallet: string; issued_at: number } | null;
}

human.use("/*", async (c, next) => {
  // All write paths and premium exports fail closed if the rate limiter or D1 is absent.
  if (c.req.method !== "GET" && c.req.header("Origin") && c.req.header("Origin") !== "https://buildawallet.xyz") {
    return json(c, { error: "Invalid origin" }, 403);
  }
  if (c.req.method !== "GET") {
    if (!c.env.REQUEST_RATE_LIMITER) return json(c, { error: "Service unavailable" }, 503);
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const limit = await c.env.REQUEST_RATE_LIMITER.limit({ key: `human:${ip}` });
    if (!limit.success) return json(c, { error: "Try again in a minute" }, 429);
  }
  await next();
});

human.get("/subscription", async (c) => {
  let schemaReady = false;
  if (c.env.DB) {
    try { await c.env.DB.prepare("SELECT 1 FROM human_payments LIMIT 1").run(); schemaReady = true; } catch { /* migration missing */ }
  }
  return json(c, {
  priceUSDC: "19.99", durationDays: 30, renewal: "manual", feature: "premium implementation blueprint export",
  chains: { base: { collector: BASE_COLLECTOR, token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    solana: { collector: SOLANA_COLLECTOR, token: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", collectorTokenAccount: "Hp6uUt3RmYYVmeSYyf6LpimgddHbL9QJ1LG9TbK5pJiQ" } },
  available: Boolean(schemaReady && c.env.BASE_RPC_URL?.startsWith("https://") &&
    c.env.SOLANA_RPC_URL?.startsWith("https://") && c.env.REQUEST_RATE_LIMITER),
});
});

human.post("/challenge", async (c) => {
  if (!c.env.DB) return json(c, { error: "Subscription unavailable" }, 503);
  const body: any = await c.req.json().catch(() => ({}));
  const wallet = normalizedWallet(body.chain, body.wallet);
  if (!wallet) return json(c, { error: "Choose a valid Base or Solana wallet" }, 400);
  const issued = now(), nonce = token();
  await c.env.DB.prepare("INSERT INTO human_challenges(nonce,chain,wallet,issued_at,expires_at) VALUES(?,?,?,?,?)")
    .bind(nonce, body.chain, wallet, issued, issued + 300).run();
  return json(c, { nonce, message: challengeMessage(body.chain, wallet, nonce, issued), expiresAt: issued + 300 });
});

human.post("/login", async (c) => {
  if (!c.env.DB) return json(c, { error: "Subscription unavailable" }, 503);
  const body: any = await c.req.json().catch(() => ({}));
  if (typeof body.nonce !== "string" || !/^[0-9a-f]{64}$/.test(body.nonce) || typeof body.signature !== "string") {
    return json(c, { error: "Invalid wallet proof" }, 400);
  }
  const record = await c.env.DB.prepare("SELECT chain,wallet,issued_at FROM human_challenges WHERE nonce=? AND expires_at>? AND consumed_at IS NULL")
    .bind(body.nonce, now()).first<{ chain: Chain; wallet: string; issued_at: number }>();
  if (!record || !await verifySignature(record.chain, record.wallet,
    challengeMessage(record.chain, record.wallet, body.nonce, record.issued_at), body.signature)) {
    return json(c, { error: "Wallet signature is invalid or expired" }, 401);
  }
  const issued = now(), accessToken = token();
  // A conditional update and insert in one D1 transaction makes each challenge one-use.
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO human_sessions(token_hash,chain,wallet,issued_at,expires_at)
        SELECT ?,chain,wallet,?,? FROM human_challenges WHERE nonce=? AND consumed_at IS NULL AND expires_at>?`)
        .bind(await hash(accessToken), issued, issued + MONTH, body.nonce, issued),
      c.env.DB.prepare("UPDATE human_challenges SET consumed_at=? WHERE nonce=? AND consumed_at IS NULL AND expires_at>?")
        .bind(issued, body.nonce, issued),
    ]);
    // Conditional insert can affect zero rows in a concurrent replay; check our own session.
    const proof = await c.env.DB.prepare("SELECT token_hash FROM human_sessions WHERE token_hash=?")
      .bind(await hash(accessToken)).first();
    if (!proof) return json(c, { error: "Challenge was already used" }, 409);
  } catch { return json(c, { error: "Login unavailable" }, 503); }
  return json(c, { accessToken, chain: record.chain, wallet: record.wallet, expiresAt: issued + MONTH });
});

human.get("/status", async (c) => {
  const user = await session(c);
  if (!user) return json(c, { error: "Connect and sign with your wallet" }, 401);
  const row = await c.env.DB!.prepare("SELECT expires_at FROM human_entitlements WHERE chain=? AND wallet=?")
    .bind(user.chain, user.wallet).first<{ expires_at: number }>();
  return json(c, { chain: user.chain, wallet: user.wallet, active: Boolean(row && row.expires_at > now()),
    expiresAt: row?.expires_at ?? null });
});

human.post("/confirm", async (c) => {
  const user = await session(c);
  if (!user) return json(c, { error: "Connect and sign with your paying wallet" }, 401);
  const body: any = await c.req.json().catch(() => ({}));
  const rawTx = typeof body.tx === "string" ? body.tx.trim() : "";
  const tx = user.chain === "base" ? rawTx.toLowerCase() : rawTx;
  if (!tx || tx.length > 100) return json(c, { error: "Enter a transaction ID" }, 400);
  const rpcUrl = user.chain === "base" ? c.env.BASE_RPC_URL : c.env.SOLANA_RPC_URL;
  if (!rpcUrl || !/^https:\/\//.test(rpcUrl)) return json(c, { error: "Payment verification unavailable" }, 503);
  const existing = await c.env.DB!.prepare("SELECT wallet FROM human_payments WHERE chain=? AND tx=?")
    .bind(user.chain, tx).first<{ wallet: string }>();
  if (existing) return json(c, { error: "Transaction has already been used" }, 409);
  let paidAt: number;
  try {
    paidAt = user.chain === "base" ? await verifyBaseReceipt(rpcUrl, tx, user.wallet, user.issued_at) :
      await verifySolanaReceipt(rpcUrl, tx, user.wallet, user.issued_at);
  } catch (error) {
    if (error instanceof PendingReceipt) return json(c, { error: error.message }, 409);
    return json(c, { error: error instanceof Error ? error.message : "Payment could not be verified" }, 422);
  }
  const expires = now() + MONTH;
  try {
    await c.env.DB!.batch([
      c.env.DB!.prepare("INSERT INTO human_payments(chain,tx,wallet,amount_atomic,paid_at) VALUES(?,?,?,?,?)")
        .bind(user.chain, tx, user.wallet, PRICE_ATOMIC.toString(), paidAt),
      c.env.DB!.prepare(`INSERT INTO human_entitlements(chain,wallet,expires_at) VALUES(?,?,?)
        ON CONFLICT(chain,wallet) DO UPDATE SET expires_at=MAX(human_entitlements.expires_at, ?)+?`)
        .bind(user.chain, user.wallet, expires, now(), MONTH),
    ]);
  } catch { return json(c, { error: "Transaction already used or subscription storage unavailable" }, 409); }
  const row = await c.env.DB!.prepare("SELECT expires_at FROM human_entitlements WHERE chain=? AND wallet=?")
    .bind(user.chain, user.wallet).first<{ expires_at: number }>();
  return json(c, { status: "unlocked", chain: user.chain, wallet: user.wallet, expiresAt: row?.expires_at, tx });
});

human.post("/blueprint", async (c) => {
  const user = await session(c);
  if (!user) return json(c, { error: "Connect and sign with your wallet" }, 401);
  const entitlement = await c.env.DB!.prepare("SELECT expires_at FROM human_entitlements WHERE chain=? AND wallet=? AND expires_at>?")
    .bind(user.chain, user.wallet, now()).first();
  if (!entitlement) return json(c, { error: "An active subscription is required" }, 402);
  const body: any = await c.req.json().catch(() => ({}));
  const spec = body.spec;
  if (!spec || typeof spec !== "object" || Array.isArray(spec) || JSON.stringify(spec).length > 12_000) {
    return json(c, { error: "A wallet blueprint is required" }, 400);
  }
  const groups = ["assets", "networks", "security", "features", "platforms", "privacy"];
  const selected: Record<string, string[]> = {};
  for (const group of groups) selected[group] = Array.isArray(spec[group]) ?
    spec[group].filter((value: unknown) => typeof value === "string" && /^[a-z0-9_-]{1,64}$/i.test(value)).slice(0, 200) : [];
  const name = typeof spec.name === "string" ? spec.name.slice(0, 40) : "Untitled wallet";
  const networkTasks: Record<string, string> = {
    n_base: "Base: require chain ID 8453, validate EVM destinations, and display ETH gas before approval",
    n_eth: "Ethereum: require chain ID 1, estimate gas, and handle replacement and failed transactions",
    n_test: "Test networks: keep keys, RPC endpoints and balances separate from mainnet",
    n_ln: "Lightning: define invoice expiry, payment status and liquidity failure handling",
    n_ibc: "IBC: identify source and destination zones, channels, timeout and acknowledgement handling",
    n_custom: "Custom RPC: verify chain identity and block unsafe or unknown chain IDs",
  };
  const featureTasks: Record<string, string> = {
    f_send: "Send: verify destination, token, amount, fees, chain and final approval on a review screen",
    f_swap: "Swap: disclose quote expiry, slippage, approvals, route and minimum received before signing",
    f_bridge: "Bridge: show both chains, bridge provider, receiving address, fees and failure recovery",
    f_stake: "Staking: explain validator choice, lockups, unstaking time and reward variability",
    f_dapp: "dApp browser: isolate site permissions, simulate requests and make revocation discoverable",
    f_session: "Session keys: limit destinations, spend, duration and revocation for each session",
    f_onramp: "On-ramp: distinguish external provider custody, fees, identity checks and settlement timing",
    f_ai: "AI copilot: keep advice separate from signed actions and require explicit user approval",
    f_payroll: "Payroll: preview recipients and total, enforce approval thresholds and export audit records",
  };
  const networkChecklist = selected.networks.map(id => networkTasks[id] ?? `Validate RPC identity, address formats and failure behavior for ${id}`);
  const featureChecklist = selected.features.map(id => featureTasks[id] ?? `Specify permissions, error states and acceptance tests for ${id}`);
  const custody = String(spec.custody ?? "").slice(0, 64);
  const custodyChecklist = custody === "c_seed" ? "Test offline seed backup, restore and loss warning without transmitting the seed" :
    custody === "c_multisig" ? "Define signer threshold, recovery, rotation and transaction approval workflow" :
    custody === "c_custodial" ? "Document operational key custody, access controls, incident response and applicable obligations" :
    custody === "c_aa" ? "Review smart account validation, bundler and paymaster failure cases" :
    "Document who holds each key and how users recover access";
  return json(c, {
    format: "buildawallet-premium-implementation-blueprint", version: 1,
    name, generatedAt: new Date().toISOString(), subscriptionExpiresAt: entitlement.expires_at,
    design: { ...selected, custody, style: String(spec.style ?? "").slice(0, 64) },
    implementationPlan: [
      { stage: "Scope", tasks: ["Review selected networks, assets and custody model with the intended users", "Document recovery, access and fee expectations"] },
      { stage: "Security design", tasks: [custodyChecklist, "Model abuse cases, key loss and chain transaction failure", "Arrange independent review before handling real funds"] },
      { stage: "Network integration", tasks: networkChecklist.length ? networkChecklist : ["Select intended networks and validate each chain identity"] },
      { stage: "Feature acceptance", tasks: featureChecklist.length ? featureChecklist : ["Select product features and define observable acceptance criteria"] },
      { stage: "Build", tasks: ["Implement each selected feature as a tested module", "Integrate network providers and validate chain IDs", "Create accessible transaction review screens"] },
      { stage: "Release", tasks: ["Test with isolated funded accounts", "Review transaction destinations and spending limits", "Monitor errors and have a rollback plan"] },
    ],
    constraints: ["Design document only", "No keys, signing service, executable wallet or APK included"],
  });
});

// The human Python Worker is reached through a service binding, avoiding the broken /api/* zone route.
human.all("/*", async (c) => {
  const path = c.req.path.slice("/machine/human/".length);
  const allowed = /^(start|catalog|chat|save|gallery|stats|wallet\/[a-zA-Z0-9]{1,32})$/;
  if (!allowed.test(path) || !c.env.HUMAN_API ||
      !((c.req.method === "GET" && !["chat", "save"].includes(path)) ||
        (c.req.method === "POST" && ["chat", "save"].includes(path)))) {
    return json(c, { error: "Human API unavailable" }, 503);
  }
  try {
    const destination = new URL(`/api/${path}`, "https://buildawallet.xyz");
    const request = new Request(destination, { method: c.req.method,
      headers: { "content-type": "application/json" },
      body: c.req.method === "POST" ? await c.req.text() : undefined });
    const response = await c.env.HUMAN_API.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers });
  } catch { return json(c, { error: "Human API unavailable" }, 503); }
});

export default human;
