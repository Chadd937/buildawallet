import { ORIGIN } from "./config";

/** Dependencies an agent installs before running the local wallet kit. */
export const KIT_DEPENDENCIES = [
  "@scure/bip39",
  "@scure/bip32",
  "@scure/base",
  "@scure/btc-signer",
  "@noble/hashes",
  "@noble/curves",
  "ethers",
] as const;

export const KIT_PATHS = {
  evm: "m/44'/60'/0'/0/0",
  solana: "m/44'/501'/0'/0'",
  bitcoin: "m/84'/0'/0'/0/0",
} as const;

/**
 * Self-contained Node 18+ ESM script. Runs entirely on the agent's machine:
 * creates (or reloads) a BIP-39 phrase, stores it with 0600 permissions, and
 * prints only public addresses. Nothing is sent to BuildAWallet.
 */
export const AGENT_KIT_SOURCE = `#!/usr/bin/env node
// BuildAWallet agent wallet kit ,  runs locally, never contacts a server.
// Install: npm i ${KIT_DEPENDENCIES.join(" ")}
// Run:     node baw-agent-wallet.mjs            (creates ./baw-wallet.json once)
//          BAW_WALLET_FILE=/secure/path.json node baw-agent-wallet.mjs
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
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

const FILE = process.env.BAW_WALLET_FILE || "./baw-wallet.json";
const hex = (b) => "0x" + Buffer.from(b).toString("hex");

function slip10(seed, path) {
  let I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  let key = I.slice(0, 32), chain = I.slice(32);
  for (const seg of path.replace(/^m\\//, "").split("/")) {
    const data = new Uint8Array(37); data.set(key, 1);
    new DataView(data.buffer).setUint32(33, (parseInt(seg, 10) | 0x80000000) >>> 0, false);
    I = hmac(sha512, chain, data); key = I.slice(0, 32); chain = I.slice(32);
  }
  return key;
}

let mnemonic = process.env.BAW_MNEMONIC;
if (!mnemonic && existsSync(FILE)) mnemonic = JSON.parse(readFileSync(FILE, "utf8")).mnemonic;
if (!mnemonic) {
  mnemonic = generateMnemonic(wordlist, 128);
  writeFileSync(FILE, JSON.stringify({ mnemonic, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  chmodSync(FILE, 0o600);
}
if (!validateMnemonic(mnemonic.trim(), wordlist)) throw new Error("Invalid recovery phrase");

const seed = mnemonicToSeedSync(mnemonic.trim());
const root = HDKey.fromMasterSeed(seed);
const evm = computeAddress(hex(root.derive("${KIT_PATHS.evm}").privateKey));
const sol = base58.encode(ed25519.getPublicKey(slip10(seed, "${KIT_PATHS.solana}")));
const bitcoin = btc.p2wpkh(root.derive("${KIT_PATHS.bitcoin}").publicKey).address;
const tronAddr = tron(root.derive("${KIT_PATHS.tron}").privateKey);

// Public addresses only. Same EVM address works on every EVM network.
console.log(JSON.stringify({
  walletFile: FILE,
  addresses: {
    ethereum: evm, base: evm, arbitrum: evm, optimism: evm, polygon: evm, bnb: evm, avalanche: evm,
    solana: sol, bitcoin,
  },
  next: "${ORIGIN}/machine/v1/wallets/kit",
}, null, 2));
`;

export const kitManifest = () => ({
  mode: "local",
  custody: "agent-only",
  summary:
    "Create a multichain wallet on your own machine. BuildAWallet never sees the recovery phrase or private keys.",
  install: `npm i ${KIT_DEPENDENCIES.join(" ")}`,
  download: `${ORIGIN}/machine/v1/wallets/kit.mjs`,
  run: "node baw-agent-wallet.mjs",
  derivationPaths: KIT_PATHS,
  compatibility:
    "Standard BIP-39 / BIP-44 / BIP-84 / SLIP-10 paths ,  the same phrase restores in MetaMask, Phantom, Trust, Electrum-style BTC wallets and the BuildAWallet human app.",
  networks: {
    evm: ["ethereum", "base", "arbitrum", "optimism", "polygon", "bnb", "avalanche"],
    solana: ["solana"],
    bitcoin: ["bitcoin"],
  },
  afterCreation: [
    "Buy a prepaid API plan on any supported payment network and obtain a bearer API key. EVM/Solana use USDC; Bitcoin uses BTC.",
    "Read balances: GET /machine/v1/{chain}/wallet/{address} with an API key. Each request uses backend units without another blockchain payment.",
    "Send funds: use the supported /machine/v1/{chain}/transaction/prepare and /broadcast endpoints where that chain is enabled for transaction operations; sign locally.",
  ],
  serverGenerated: {
    endpoint: `${ORIGIN}/machine/v1/wallets/generate`,
    method: "POST",
    body: { acknowledgeCustodyRisk: true, words: 12 },
    warning:
      "Opt-in only. The phrase is generated in memory, returned once over TLS, and never stored or logged ,  but it does exist briefly on BuildAWallet servers. Prefer the local kit.",
  },
});
