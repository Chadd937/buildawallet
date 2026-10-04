import { Contract, JsonRpcProvider, Network, Wallet, formatUnits, isAddress, parseUnits } from "ethers";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64, hex } from "@scure/base";
import * as btc from "@scure/btc-signer";
import type { ChainDef, TokenDef } from "./chains";
import { privHex, tronAddressToHex, type DerivedAccounts, type PublicAddresses } from "./derive";
import { solanaRpc } from "./rpc.functions";

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export type Holding = { chainId: string; symbol: string; name: string; amount: string; raw: bigint; decimals: number; token?: TokenDef };

export const addressFor = (chain: ChainDef, a: PublicAddresses) =>
  chain.family === "evm" ? a.evm : chain.family === "solana" ? a.solana : chain.family === "bitcoin" ? a.bitcoin : a.tron;

/* ---------------- EVM ---------------- */
const providers = new Map<string, JsonRpcProvider>();
async function evmProvider(chain: ChainDef): Promise<JsonRpcProvider> {
  const cached = providers.get(chain.id);
  if (cached) return cached;
  let last: unknown;
  for (const url of chain.rpc) {
    try {
      const p = new JsonRpcProvider(url, Network.from(chain.chainId!), { staticNetwork: true });
      await p.getBlockNumber();
      providers.set(chain.id, p);
      return p;
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`${chain.name} network unreachable${last instanceof Error ? `: ${last.message}` : ""}`);
}

/* ---------------- Solana ---------------- */
async function sol<T>(method: string, params: unknown[]): Promise<T> {
  const r = await solanaRpc({ data: { method, params } });
  if (r.error) throw new Error(r.error);
  return JSON.parse(r.json) as T;
}
const SYSTEM = new Uint8Array(32);
const TOKEN_PROGRAM = base58.decode("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = base58.decode("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function onCurve(b: Uint8Array) {
  try {
    ed25519.Point.fromBytes(b);
    return true;
  } catch {
    return false;
  }
}
function findPda(seeds: Uint8Array[], program: Uint8Array) {
  const marker = new TextEncoder().encode("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), program, marker];
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { buf.set(p, o); o += p.length; }
    const h = sha256(buf);
    if (!onCurve(h)) return h;
  }
  throw new Error("Could not derive token account");
}
const ata = (owner: Uint8Array, mint: Uint8Array) => findPda([owner, TOKEN_PROGRAM, mint], ATA_PROGRAM);

function compact(n: number) {
  const out: number[] = [];
  for (;;) {
    let b = n & 0x7f;
    n >>= 7;
    if (n) b |= 0x80;
    out.push(b);
    if (!n) return out;
  }
}
const u64le = (v: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, v, true); return b; };

type Ix = { program: number; accounts: number[]; data: Uint8Array };
function solMessage(header: [number, number, number], keys: Uint8Array[], blockhash: string, ixs: Ix[]) {
  const parts: number[] = [...header, ...compact(keys.length)];
  for (const k of keys) parts.push(...k);
  parts.push(...base58.decode(blockhash));
  parts.push(...compact(ixs.length));
  for (const ix of ixs) {
    parts.push(ix.program, ...compact(ix.accounts.length), ...ix.accounts, ...compact(ix.data.length), ...ix.data);
  }
  return Uint8Array.from(parts);
}
async function solSignSend(msg: Uint8Array, secret: Uint8Array) {
  const sig = ed25519.sign(msg, secret);
  const txBytes = Uint8Array.from([...compact(1), ...sig, ...msg]);
  return sol<string>("sendTransaction", [base64.encode(txBytes), { encoding: "base64", preflightCommitment: "confirmed" }]);
}
function validSolAddress(a: string) {
  try { return base58.decode(a).length === 32; } catch { return false; }
}

/* ---------------- Bitcoin ---------------- */
async function btcApi(chain: ChainDef, path: string, init?: RequestInit) {
  let last = "";
  for (const base of chain.rpc) {
    try {
      const r = await fetch(base + path, init);
      if (r.ok) return r;
      last = `${r.status} ${await r.text()}`;
    } catch (e) { last = e instanceof Error ? e.message : String(e); }
  }
  throw new Error(`Bitcoin network: ${last}`);
}

/* ---------------- Tron ---------------- */
async function tron<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`https://api.trongrid.io${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : null,
  });
  if (!r.ok) throw new Error(`Tron network ${r.status}`);
  return r.json() as Promise<T>;
}

/* ================= Balances ================= */
export async function fetchHoldings(chain: ChainDef, a: PublicAddresses): Promise<Holding[]> {
  const addr = addressFor(chain, a);
  const native = (raw: bigint): Holding => ({
    chainId: chain.id, symbol: chain.symbol, name: chain.name, raw, decimals: chain.decimals,
    amount: formatUnits(raw, chain.decimals),
  });
  const tok = (t: TokenDef, raw: bigint): Holding => ({
    chainId: chain.id, symbol: t.symbol, name: t.name, raw, decimals: t.decimals, token: t,
    amount: formatUnits(raw, t.decimals),
  });

  if (chain.family === "evm") {
    const p = await evmProvider(chain);
    const [bal, ...toks] = await Promise.all([
      p.getBalance(addr),
      ...chain.tokens.map((t) => (new Contract(t.address, ERC20, p).getFunction("balanceOf")(addr) as Promise<bigint>)),
    ]);
    return [native(bal), ...chain.tokens.map((t, i) => tok(t, toks[i] ?? 0n))];
  }
  if (chain.family === "solana") {
    const bal = await sol<{ value: number }>("getBalance", [addr, { commitment: "confirmed" }]);
    const out = [native(BigInt(bal.value))];
    for (const t of chain.tokens) {
      const res = await sol<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }>(
        "getTokenAccountsByOwner", [addr, { mint: t.address }, { encoding: "jsonParsed" }],
      ).catch(() => ({ value: [] }));
      const raw = res.value.reduce((s, v) => s + BigInt(v.account.data.parsed.info.tokenAmount.amount), 0n);
      out.push(tok(t, raw));
    }
    return out;
  }
  if (chain.family === "bitcoin") {
    const r = await btcApi(chain, `/address/${addr}`);
    const j = (await r.json()) as { chain_stats: { funded_txo_sum: number; spent_txo_sum: number }; mempool_stats: { funded_txo_sum: number; spent_txo_sum: number } };
    const sats = j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum + j.mempool_stats.funded_txo_sum - j.mempool_stats.spent_txo_sum;
    return [native(BigInt(sats))];
  }
  // tron
  const acct = await tron<{ data: { balance?: number; trc20?: Record<string, string>[] }[] }>(`/v1/accounts/${addr}`);
  const d = acct.data[0];
  const trc20 = Object.assign({}, ...(d?.trc20 ?? [])) as Record<string, string>;
  return [native(BigInt(d?.balance ?? 0)), ...chain.tokens.map((t) => tok(t, BigInt(trc20[t.address] ?? "0")))];
}

export async function fetchPrices(ids: string[], currency: string): Promise<Record<string, number>> {
  const uniq = [...new Set(ids)].join(",");
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${uniq}&vs_currencies=${currency}`);
  if (!r.ok) throw new Error("Price feed unavailable");
  const j = (await r.json()) as Record<string, Record<string, number>>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(j)) {
    const price = v[currency];
    if (typeof price === "number" && Number.isFinite(price) && price > 0) out[k] = price;
  }
  return out;
}

/* ================= Validation ================= */
export function validateRecipient(chain: ChainDef, to: string) {
  if (chain.family === "evm") return isAddress(to);
  if (chain.family === "solana") return validSolAddress(to);
  if (chain.family === "bitcoin") {
    try { btc.Address(btc.NETWORK).decode(to); return true; } catch { return false; }
  }
  try { tronAddressToHex(to); return true; } catch { return false; }
}

/* ================= Fee estimate ================= */
export async function estimateFee(chain: ChainDef, token?: TokenDef): Promise<{ label: string; detail: string; btcRate?: number }> {
  if (chain.family === "evm") {
    const p = await evmProvider(chain);
    const fee = await p.getFeeData();
    const gas = token ? 65_000n : 21_000n;
    const per = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
    return { label: `${formatUnits(per * gas, 18).slice(0, 10)} ${chain.symbol}`, detail: "Max network fee" };
  }
  if (chain.family === "solana") return { label: token ? "≈0.00204 SOL max" : "0.000005 SOL", detail: token ? "Includes account rent if recipient has no USDC account" : "Base fee" };
  if (chain.family === "bitcoin") {
    const r = await btcApi(chain, "/v1/fees/recommended").catch(() => null);
    const rate = r ? ((await r.json()) as { halfHourFee: number }).halfHourFee : 10;
    return { label: `${rate} sat/vB`, detail: "~30 min confirmation", btcRate: rate };
  }
  return { label: token ? "Up to 30 TRX" : "Free–1.1 TRX", detail: token ? "Energy cost, burned if no staked energy" : "Bandwidth" };
}

/* ================= Send ================= */
export async function send(opts: {
  chain: ChainDef;
  accounts: DerivedAccounts;
  to: string;
  amount: string;
  token?: TokenDef | undefined;
  btcFeeRate?: number | undefined;
}): Promise<string> {
  const { chain, accounts, to, amount, token } = opts;
  if (!validateRecipient(chain, to)) throw new Error(`That isn't a valid ${chain.name} address.`);
  const decimals = token ? token.decimals : chain.decimals;
  const value = parseUnits(amount, decimals);
  if (value <= 0n) throw new Error("Enter an amount above zero.");

  if (chain.family === "evm") {
    const p = await evmProvider(chain);
    const w = new Wallet(privHex(accounts.evm.privateKey), p);
    const tx = token
      ? await (new Contract(token.address, ERC20, w).getFunction("transfer")(to, value) as Promise<{ hash: string }>)
      : await w.sendTransaction({ to, value });
    return tx.hash;
  }

  if (chain.family === "solana") {
    const from = accounts.solana.publicKey;
    const toKey = base58.decode(to);
    if (hex.encode(from) === hex.encode(toKey)) throw new Error("You can't send to your own address.");
    const { value: bh } = await sol<{ value: { blockhash: string } }>("getLatestBlockhash", [{ commitment: "confirmed" }]);
    if (!token) {
      const data = new Uint8Array(12);
      new DataView(data.buffer).setUint32(0, 2, true);
      data.set(u64le(value), 4);
      const msg = solMessage([1, 0, 1], [from, toKey, SYSTEM], bh.blockhash, [{ program: 2, accounts: [0, 1], data }]);
      return solSignSend(msg, accounts.solana.secret);
    }
    const mint = base58.decode(token.address);
    const srcAta = ata(from, mint);
    const dstAta = ata(toKey, mint);
    // keys: 0 from(s,w) 1 srcAta(w) 2 dstAta(w) 3 owner 4 mint 5 system 6 token 7 ataProgram
    const keys = [from, srcAta, dstAta, toKey, mint, SYSTEM, TOKEN_PROGRAM, ATA_PROGRAM];
    const createIx: Ix = { program: 7, accounts: [0, 2, 3, 4, 5, 6], data: Uint8Array.of(1) };
    const tdata = new Uint8Array(10);
    tdata[0] = 12;
    tdata.set(u64le(value), 1);
    tdata[9] = token.decimals;
    const transferIx: Ix = { program: 6, accounts: [1, 4, 2, 0], data: tdata };
    const msg = solMessage([1, 0, 5], keys, bh.blockhash, [createIx, transferIx]);
    return solSignSend(msg, accounts.solana.secret);
  }

  if (chain.family === "bitcoin") {
    const { address, publicKey, privateKey } = accounts.bitcoin;
    const utxos = (await (await btcApi(chain, `/address/${address}/utxo`)).json()) as { txid: string; vout: number; value: number; status: { confirmed: boolean } }[];
    const spendable = utxos.filter((u) => u.status.confirmed).sort((x, y) => y.value - x.value);
    const rate = BigInt(Math.max(1, Math.ceil(opts.btcFeeRate ?? 10)));
    const script = btc.p2wpkh(publicKey).script;
    const tx = new btc.Transaction();
    let inSum = 0n;
    let fee = 0n;
    for (const u of spendable) {
      tx.addInput({ txid: u.txid, index: u.vout, witnessUtxo: { script, amount: BigInt(u.value) } });
      inSum += BigInt(u.value);
      fee = (11n + 68n * BigInt(tx.inputsLength) + 31n * 2n) * rate;
      if (inSum >= value + fee) break;
    }
    if (inSum < value + fee) throw new Error("Not enough confirmed BTC to cover amount plus network fee.");
    tx.addOutputAddress(to, value, btc.NETWORK);
    const change = inSum - value - fee;
    if (change > 546n) tx.addOutputAddress(address, change, btc.NETWORK);
    tx.sign(privateKey);
    tx.finalize();
    const r = await btcApi(chain, "/tx", { method: "POST", body: tx.hex });
    return (await r.text()).trim();
  }

  // Tron
  const owner = tronAddressToHex(accounts.tron.address);
  const toHex = tronAddressToHex(to);
  type TronTx = { txID: string; raw_data: unknown; raw_data_hex: string; Error?: string };
  let txn: TronTx;
  if (!token) {
    txn = await tron<TronTx>("/wallet/createtransaction", { owner_address: owner, to_address: toHex, amount: Number(value) });
  } else {
    const param = toHex.slice(2).padStart(64, "0") + value.toString(16).padStart(64, "0");
    const res = await tron<{ transaction: TronTx; result: { result?: boolean; message?: string } }>("/wallet/triggersmartcontract", {
      owner_address: owner, contract_address: tronAddressToHex(token.address),
      function_selector: "transfer(address,uint256)", parameter: param, fee_limit: 30_000_000, call_value: 0,
    });
    if (!res.result?.result) throw new Error(res.result?.message ?? "Tron contract call rejected");
    txn = res.transaction;
  }
  if (txn.Error || !txn.txID) throw new Error(txn.Error ?? "Tron transaction build failed");
  // verify the node built what we asked: txID must equal sha256(raw_data_hex)
  if (hex.encode(sha256(hex.decode(txn.raw_data_hex))) !== txn.txID) throw new Error("Tron node returned a tampered transaction");
  const rec = secp256k1.sign(hex.decode(txn.txID), accounts.tron.privateKey, { prehash: false, format: "recovered" });
  const sig = hex.encode(rec.slice(1)) + ((rec[0] ?? 0) + 27).toString(16).padStart(2, "0");
  const out = await tron<{ result?: boolean; txid?: string; message?: string }>("/wallet/broadcasttransaction", { ...txn, signature: [sig] });
  if (!out.result) throw new Error(out.message ? safeHexMsg(out.message) : "Tron broadcast failed");
  return txn.txID;
}

function safeHexMsg(m: string) {
  try { return new TextDecoder().decode(hex.decode(m)); } catch { return m; }
}
