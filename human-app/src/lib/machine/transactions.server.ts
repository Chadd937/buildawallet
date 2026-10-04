import { BASE_USDC, SOLANA_USDC } from "./config";
import { machineChain, validAddress } from "./chains";

const BASE_USDC_ADDRESS = BASE_USDC.toLowerCase();
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const base = machineChain("base")!;
const solana = machineChain("solana")!;
const validBaseAddress = (value?: string) => Boolean(value && validAddress(base, value));
const validSolanaAddress = (value?: string) => Boolean(value && validAddress(solana, value));
const checkBaseRpc = async (url: string) => {
  if (Number(BigInt(await jsonRpc(url, "eth_chainId", []))) !== 8453) throw new Error("Base RPC network mismatch");
};
const checkSolanaRpc = async (url: string) => {
  if (await jsonRpc(url, "getGenesisHash", []) !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") throw new Error("Solana RPC network mismatch");
};

async function jsonRpc(url: string, method: string, params: unknown[]) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("RPC unavailable");
  const payload: any = await response.json();
  if (payload?.error || !("result" in (payload ?? {}))) throw new Error("Invalid RPC response");
  return payload.result;
}

function quantity(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be an unsigned integer string`);
  const parsed = BigInt(value);
  if (parsed < 0n) throw new Error(`${field} must not be negative`);
  return parsed;
}

function hexQuantity(value: bigint) {
  return `0x${value.toString(16)}`;
}

function erc20Transfer(to: string, amount: bigint) {
  return `0xa9059cbb${to.slice(2).toLowerCase().padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
}

function encodeShort(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid compact length");
  const out: number[] = [];
  let current = value;
  do {
    let byte = current & 0x7f;
    current >>>= 7;
    if (current) byte |= 0x80;
    out.push(byte);
  } while (current);
  return out;
}

function base58Decode(value: string): Uint8Array {
  if (!value) throw new Error("Invalid base58 value");
  let number = 0n;
  for (const char of value) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) throw new Error("Invalid base58 value");
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.push(Number(number & 255n));
    number >>= 8n;
  }
  bytes.reverse();
  let leading = 0;
  while (leading < value.length && value[leading] === "1") leading++;
  return Uint8Array.from([...new Array(leading).fill(0), ...bytes]);
}

function u64le(value: bigint) {
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error("Amount exceeds u64");
  const out = new Uint8Array(8);
  let current = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(current & 255n);
    current >>= 8n;
  }
  return out;
}

function u32le(value: number) {
  return Uint8Array.from([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concat(...arrays: Uint8Array[]) {
  const length = arrays.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const item of arrays) { out.set(item, offset); offset += item.length; }
  return out;
}

function vec(bytes: Uint8Array) {
  return concat(Uint8Array.from(encodeShort(bytes.length)), bytes);
}

function pubkey(value: string) {
  const decoded = base58Decode(value);
  if (decoded.length !== 32) throw new Error("Invalid Solana public key");
  return decoded;
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function legacyTransaction(accountKeys: string[], readonlyUnsigned: number, blockhash: string,
  programIndex: number, accountIndexes: number[], instructionData: Uint8Array) {
  const keys = concat(...accountKeys.map(pubkey));
  const message = concat(
    Uint8Array.from([1, 0, readonlyUnsigned]),
    Uint8Array.from(encodeShort(accountKeys.length)),
    keys,
    pubkey(blockhash),
    Uint8Array.from([1, programIndex]),
    Uint8Array.from(encodeShort(accountIndexes.length)),
    Uint8Array.from(accountIndexes),
    vec(instructionData),
  );
  const wire = concat(Uint8Array.from([1]), new Uint8Array(64), message);
  if (wire.length > 1232) throw new Error("Prepared Solana transaction exceeds packet limit");
  return { messageBase64: base64(message), transactionBase64: base64(wire) };
}

export type PrepareIntent = {
  from?: string;
  to?: string;
  asset?: "native" | "usdc";
  amountAtomic?: string;
  data?: string;
  sourceTokenAccount?: string;
  destinationTokenAccount?: string;
};

export async function prepareBaseTransaction(url: string, intent: PrepareIntent) {
  if (!validBaseAddress(intent.from) || !validBaseAddress(intent.to)) throw new Error("Valid Base from and to addresses required");
  const asset = intent.asset === "usdc" ? "usdc" : "native";
  const amount = quantity(intent.amountAtomic ?? "", "amountAtomic");
  await checkBaseRpc(url);
  const from = intent.from;
  const to = intent.to;
  if (!from || !to) throw new Error("Valid Base from and to addresses required");
  const tx: Record<string, string> = { from };
  if (asset === "native") {
    tx["to"] = to;
    tx["value"] = hexQuantity(amount);
    if (intent.data && intent.data !== "0x") {
      if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(intent.data)) throw new Error("data must be even-length hex");
      tx["data"] = intent.data;
    }
  } else {
    tx["to"] = BASE_USDC_ADDRESS;
    tx["value"] = "0x0";
    tx["data"] = erc20Transfer(to, amount);
  }
  const [nonce, gas, priority, block] = await Promise.all([
    jsonRpc(url, "eth_getTransactionCount", [from, "pending"]),
    jsonRpc(url, "eth_estimateGas", [tx]),
    jsonRpc(url, "eth_maxPriorityFeePerGas", []),
    jsonRpc(url, "eth_getBlockByNumber", ["latest", false]),
  ]);
  if (!/^0x[0-9a-fA-F]+$/.test(nonce) || !/^0x[0-9a-fA-F]+$/.test(gas) ||
      !/^0x[0-9a-fA-F]+$/.test(priority) || !/^0x[0-9a-fA-F]+$/.test(block?.baseFeePerGas ?? "")) {
    throw new Error("Base RPC returned invalid fee data");
  }
  const priorityFee = BigInt(priority);
  const maxFee = BigInt(block.baseFeePerGas) * 2n + priorityFee;
  return {
    chain: "base",
    network: "mainnet",
    asset,
    token: asset === "usdc" ? BASE_USDC : undefined,
    amountAtomic: amount.toString(),
    unsignedTransaction: {
      ...tx,
      chainId: "0x2105",
      nonce,
      gas,
      maxPriorityFeePerGas: hexQuantity(priorityFee),
      maxFeePerGas: hexQuantity(maxFee),
      type: "0x2",
    },
    signing: "Sign this transaction in the caller's EVM wallet. Do not send a private key to BuildAWallet.",
  };
}

export async function broadcastBaseTransaction(url: string, signedTransaction: string) {
  if (!/^0x[0-9a-fA-F]{2,262144}$/.test(signedTransaction) || signedTransaction.length % 2 !== 0)
    throw new Error("signedTransaction must be a raw signed EVM transaction hex string");
  await checkBaseRpc(url);
  const tx = await jsonRpc(url, "eth_sendRawTransaction", [signedTransaction]);
  if (typeof tx !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("Base RPC returned invalid transaction hash");
  return { chain: "base", submitted: true, tx, explorer: `https://basescan.org/tx/${tx}` };
}

export async function prepareSolanaTransaction(url: string, intent: PrepareIntent) {
  if (!validSolanaAddress(intent.from) || !validSolanaAddress(intent.to)) throw new Error("Valid Solana from and to addresses required");
  const from = intent.from;
  const to = intent.to;
  if (!from || !to) throw new Error("Valid Solana from and to addresses required");
  const asset = intent.asset === "usdc" ? "usdc" : "native";
  const amount = quantity(intent.amountAtomic ?? "", "amountAtomic");
  await checkSolanaRpc(url);
  const latest = await jsonRpc(url, "getLatestBlockhash", [{ commitment: "confirmed" }]);
  const blockhash = latest?.value?.blockhash;
  if (typeof blockhash !== "string" || base58Decode(blockhash).length !== 32) throw new Error("Solana RPC returned invalid blockhash");
  let prepared;
  if (asset === "native") {
    const data = concat(u32le(2), u64le(amount));
    prepared = legacyTransaction([from, to, SYSTEM_PROGRAM], 1, blockhash, 2, [0, 1], data);
  } else {
    if (!validSolanaAddress(intent.sourceTokenAccount) || !validSolanaAddress(intent.destinationTokenAccount)) {
      throw new Error("sourceTokenAccount and destinationTokenAccount are required for Solana USDC");
    }
    const data = concat(Uint8Array.from([12]), u64le(amount), Uint8Array.from([6]));
    const sourceTokenAccount = intent.sourceTokenAccount;
    const destinationTokenAccount = intent.destinationTokenAccount;
    if (!sourceTokenAccount || !destinationTokenAccount) throw new Error("Valid Solana token accounts required");
    prepared = legacyTransaction([
      from,
      sourceTokenAccount,
      destinationTokenAccount,
      SOLANA_USDC,
      TOKEN_PROGRAM,
    ], 2, blockhash, 4, [1, 3, 2, 0], data);
  }
  return {
    chain: "solana",
    network: "mainnet",
    asset,
    token: asset === "usdc" ? SOLANA_USDC : undefined,
    amountAtomic: amount.toString(),
    recentBlockhash: blockhash,
    ...prepared,
    signing: "The transaction contains a zeroed signature slot. Sign it in the caller's Solana wallet before broadcast.",
  };
}

export async function broadcastSolanaTransaction(url: string, signedTransactionBase64: string) {
  if (typeof signedTransactionBase64 !== "string" || signedTransactionBase64.length < 80 || signedTransactionBase64.length > 4096 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(signedTransactionBase64)) {
    throw new Error("signedTransactionBase64 must contain a signed Solana transaction");
  }
  await checkSolanaRpc(url);
  const tx = await jsonRpc(url, "sendTransaction", [signedTransactionBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 3 }]);
  if (typeof tx !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(tx)) throw new Error("Solana RPC returned invalid signature");
  return { chain: "solana", submitted: true, tx, explorer: `https://solscan.io/tx/${tx}` };
}
