import { Contract, JsonRpcProvider, Network, Wallet, formatUnits, isAddress, parseUnits } from "ethers";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64, hex } from "@scure/base";
import * as btc from "@scure/btc-signer";
import type { ChainDef, TokenDef } from "./chains";
import { privHex, type DerivedAccounts, type PublicAddresses } from "./derive";
import { solanaRpc } from "./rpc.functions";

const ERC20 = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
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

