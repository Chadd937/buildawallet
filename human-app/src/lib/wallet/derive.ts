import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import * as btc from "@scure/btc-signer";
import { computeAddress } from "ethers";

export type DerivedAccounts = {
  evm: { address: string; privateKey: Uint8Array };
  solana: { address: string; secret: Uint8Array; publicKey: Uint8Array };
  bitcoin: { address: string; privateKey: Uint8Array; publicKey: Uint8Array };
  tron: { address: string; privateKey: Uint8Array };
};

export type PublicAddresses = { evm: string; solana: string; bitcoin: string; tron: string };

export const PATHS = {
  evm: "m/44'/60'/0'/0/0",
  solana: "m/44'/501'/0'/0'",
  bitcoin: "m/84'/0'/0'/0/0",
  tron: "m/44'/195'/0'/0/0",
} as const;

export const normalizePhrase = (p: string) => p.trim().toLowerCase().replace(/\s+/g, " ");

export function newMnemonic(strength: 128 | 256 = 128) {
  return generateMnemonic(wordlist, strength);
}

export function isValidMnemonic(phrase: string) {
  return validateMnemonic(normalizePhrase(phrase), wordlist);
}

function toHex(b: Uint8Array) {
  return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** SLIP-0010 ed25519 hardened derivation (Phantom/Solflare compatible). */
function slip10Ed25519(seed: Uint8Array, path: string) {
  const enc = new TextEncoder();
  let I = hmac(sha512, enc.encode("ed25519 seed"), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  const segments = path.replace(/^m\//, "").split("/");
  for (const seg of segments) {
    const idx = (parseInt(seg.replace("'", ""), 10) | 0x80000000) >>> 0;
    const data = new Uint8Array(37);
    data[0] = 0;
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, idx, false);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

export function tronAddressFromPriv(priv: Uint8Array) {
  const pub = secp256k1.getPublicKey(priv, false).slice(1);
  const hash = keccak_256(pub).slice(-20);
  const raw = new Uint8Array(21);
  raw[0] = 0x41;
  raw.set(hash, 1);
  const check = sha256(sha256(raw)).slice(0, 4);
  const full = new Uint8Array(25);
  full.set(raw);
  full.set(check, 21);
  return base58.encode(full);
}

export function tronAddressToHex(addr: string) {
  const bytes = base58.decode(addr);
  if (bytes.length !== 25 || bytes[0] !== 0x41) throw new Error("Invalid Tron address");
  const check = sha256(sha256(bytes.slice(0, 21))).slice(0, 4);
  if (check.some((v, i) => v !== bytes[21 + i])) throw new Error("Invalid Tron address checksum");
  return Array.from(bytes.slice(0, 21), (x) => x.toString(16).padStart(2, "0")).join("");
}

export function deriveAccounts(phrase: string): DerivedAccounts {
  const seed = mnemonicToSeedSync(normalizePhrase(phrase));
  const root = HDKey.fromMasterSeed(seed);

  const evmKey = root.derive(PATHS.evm).privateKey!;
  const btcNode = root.derive(PATHS.bitcoin);
  const tronKey = root.derive(PATHS.tron).privateKey!;
  const solSeed = slip10Ed25519(seed, PATHS.solana);
  const solPub = ed25519.getPublicKey(solSeed);

  return {
    evm: { address: computeAddress(toHex(evmKey)), privateKey: evmKey },
    solana: { address: base58.encode(solPub), secret: solSeed, publicKey: solPub },
    bitcoin: {
      address: btc.p2wpkh(btcNode.publicKey!).address!,
      privateKey: btcNode.privateKey!,
      publicKey: btcNode.publicKey!,
    },
    tron: { address: tronAddressFromPriv(tronKey), privateKey: tronKey },
  };
}

export function publicAddresses(a: DerivedAccounts): PublicAddresses {
  return { evm: a.evm.address, solana: a.solana.address, bitcoin: a.bitcoin.address, tron: a.tron.address };
}

export const privHex = toHex;
