import { SOLANA_USDC } from "./config";
import { machineChain, validAddress } from "./chains";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const solana = machineChain("solana")!;
const validSolanaAddress = (value?: string) => Boolean(value && validAddress(solana, value));
const checkEvmRpc = async (url: string, expectedChainId: number) => {
  if (Number(BigInt(await jsonRpc(url, "eth_chainId", []))) !== expectedChainId) throw new Error("EVM RPC network mismatch");
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
  asset?: "native" | "usdc" | "erc20" | "spl";
  amountAtomic?: string;
  data?: string;
  sourceTokenAccount?: string;
  destinationTokenAccount?: string;
  tokenMint?: string;
  tokenAddress?: string;
  tokenDecimals?: number;
  tokenProgramId?: string;
};

export async function prepareBaseTransaction(url: string, intent: PrepareIntent, chainId = "base") {
  const selectedChain = machineChain(chainId);
  if (!selectedChain || selectedChain.family !== "evm" || !selectedChain.chainId) throw new Error("Unsupported EVM transaction chain");
  if (!intent.from || !intent.to || !validAddress(selectedChain, intent.from) || !validAddress(selectedChain, intent.to)) throw new Error("Valid EVM from and to addresses required");
  if (intent.asset === "spl") throw new Error("SPL assets are only supported on Solana.");
  const asset = intent.asset === "erc20" ? "erc20" : intent.asset === "usdc" ? "usdc" : "native";
  const amount = quantity(intent.amountAtomic ?? "", "amountAtomic");
  if (asset === "usdc" && !selectedChain.stablecoin) throw new Error("No stablecoin configured for this chain");
  await checkEvmRpc(url, selectedChain.chainId);
  const from = intent.from;
  const to = intent.to;
  if (!from || !to) throw new Error("Valid EVM from and to addresses required");
  let tokenAddress: string | undefined;
  let tokenDecimals: number | undefined;
  if (asset === "erc20") {
    tokenAddress = intent.tokenAddress;
    tokenDecimals = Number(intent.tokenDecimals);
    if (!tokenAddress || !validAddress(selectedChain, tokenAddress)) throw new Error("A valid tokenAddress is required for a custom ERC-20 transfer");
    if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) throw new Error("tokenDecimals must be an integer from 0 through 36");
    const [decimalsHex, balanceHex] = await Promise.all([
      jsonRpc(url, "eth_call", [{ to: tokenAddress, data: "0x313ce567" }, "latest"]),
      jsonRpc(url, "eth_call", [{ to: tokenAddress, data: "0x70a08231" + from.slice(2).toLowerCase().padStart(64, "0") }, "latest"]),
    ]);
    if (typeof decimalsHex !== "string" || !/^0x[0-9a-fA-F]+$/.test(decimalsHex) ||
        typeof balanceHex !== "string" || !/^0x[0-9a-fA-F]+$/.test(balanceHex)) {
      throw new Error("Token contract returned invalid decimals or balance data");
    }
    if (Number(BigInt(decimalsHex)) !== tokenDecimals) throw new Error("tokenDecimals do not match the contract's on-chain decimals");
    if (BigInt(balanceHex) < amount) throw new Error("Insufficient ERC-20 token balance");
  }
  const tx: Record<string, string> = { from };
  if (asset === "native") {
    tx["to"] = to;
    tx["value"] = hexQuantity(amount);
    if (intent.data && intent.data !== "0x") {
      if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(intent.data)) throw new Error("data must be even-length hex");
      tx["data"] = intent.data;
    }
  } else {
    tx["to"] = asset === "usdc" ? selectedChain.stablecoin!.address : tokenAddress!;
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
    chain: selectedChain.id,
    network: "mainnet",
    asset,
    token: asset === "usdc" ? selectedChain.stablecoin!.address : asset === "erc20" ? tokenAddress : undefined,
    tokenDecimals: asset === "usdc" ? 6 : tokenDecimals,
    amountAtomic: amount.toString(),
    unsignedTransaction: {
      ...tx,
      chainId: hexQuantity(BigInt(selectedChain.chainId)),
      nonce,
      gas,
      maxPriorityFeePerGas: hexQuantity(priorityFee),
      maxFeePerGas: hexQuantity(maxFee),
      type: "0x2",
    },
    signing: "Sign this transaction in the caller's EVM wallet. Do not send a private key to BuildAWallet.",
  };
}

export async function broadcastBaseTransaction(url: string, signedTransaction: string, chainId = "base") {
  if (!/^0x[0-9a-fA-F]{2,262144}$/.test(signedTransaction) || signedTransaction.length % 2 !== 0)
    throw new Error("signedTransaction must be a raw signed EVM transaction hex string");
  const selectedChain = machineChain(chainId);
  if (!selectedChain || selectedChain.family !== "evm" || !selectedChain.chainId) throw new Error("Unsupported EVM transaction chain");
  await checkEvmRpc(url, selectedChain.chainId);
  const tx = await jsonRpc(url, "eth_sendRawTransaction", [signedTransaction]);
  if (typeof tx !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("EVM RPC returned invalid transaction hash");
  return { chain: selectedChain.id, submitted: true, tx, explorer: selectedChain.explorer + "/tx/" + tx };
}

export async function prepareSolanaTransaction(url: string, intent: PrepareIntent) {
  if (!validSolanaAddress(intent.from) || !validSolanaAddress(intent.to)) throw new Error("Valid Solana from and to addresses required");
  const from = intent.from;
  const to = intent.to;
  if (!from || !to) throw new Error("Valid Solana from and to addresses required");
  const asset = intent.asset === "spl" ? "spl" : intent.asset === "usdc" ? "usdc" : "native";
  const amount = quantity(intent.amountAtomic ?? "", "amountAtomic");
  await checkSolanaRpc(url);
  const latest = await jsonRpc(url, "getLatestBlockhash", [{ commitment: "confirmed" }]);
  const blockhash = latest?.value?.blockhash;
  if (typeof blockhash !== "string" || base58Decode(blockhash).length !== 32) throw new Error("Solana RPC returned invalid blockhash");
  let prepared;
  let tokenMint: string | undefined;
  let tokenProgram: string | undefined;
  let decimals = 6;
  if (asset === "native") {
    const data = concat(u32le(2), u64le(amount));
    prepared = legacyTransaction([from, to, SYSTEM_PROGRAM], 1, blockhash, 2, [0, 1], data);
  } else {
    const mint = asset === "usdc" ? SOLANA_USDC : intent.tokenMint;
    decimals = asset === "usdc" ? 6 : Number(intent.tokenDecimals);
    tokenProgram = asset === "usdc" ? TOKEN_PROGRAM : intent.tokenProgramId;
    if (!mint || !validSolanaAddress(mint)) throw new Error("A valid tokenMint is required for SPL transfers");
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error("tokenDecimals must be an integer from 0 through 18");
    if (tokenProgram !== TOKEN_PROGRAM && tokenProgram !== TOKEN_2022_PROGRAM) throw new Error("Unsupported SPL token program");
    if (!validSolanaAddress(intent.sourceTokenAccount) || !validSolanaAddress(intent.destinationTokenAccount)) {
      throw new Error("sourceTokenAccount and destinationTokenAccount must be valid token-account addresses");
    }
    const sourceTokenAccount = intent.sourceTokenAccount!;
    const destinationTokenAccount = intent.destinationTokenAccount!;
    const mintAccount = await jsonRpc(url, "getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
    const mintValue = mintAccount?.value;
    const mintInfo = mintValue?.data?.parsed?.info;
    if (!mintValue || mintValue.owner !== tokenProgram || mintValue.data?.parsed?.type !== "mint" ||
        mintInfo?.isInitialized !== true || mintInfo?.decimals !== decimals) {
      throw new Error("Token mint owner, initialization, or decimals do not match the requested transfer");
    }
    const unsupportedExtensions = (mintInfo.extensions ?? [])
      .map((extension: any) => String(extension?.extension ?? "unknown"))
      .filter((extension: string) => !["metadataPointer", "tokenMetadata"].includes(extension));
    if (unsupportedExtensions.length) throw new Error("Unsupported Token-2022 mint extensions: " + unsupportedExtensions.join(", "));
    const [sourceResponse, destinationResponse] = await Promise.all([
      jsonRpc(url, "getAccountInfo", [sourceTokenAccount, { encoding: "jsonParsed", commitment: "confirmed" }]),
      jsonRpc(url, "getAccountInfo", [destinationTokenAccount, { encoding: "jsonParsed", commitment: "confirmed" }]),
    ]);
    const sourceValue = sourceResponse?.value;
    const destinationValue = destinationResponse?.value;
    const sourceInfo = sourceValue?.data?.parsed?.info;
    const destinationInfo = destinationValue?.data?.parsed?.info;
    if (!sourceValue || sourceValue.owner !== tokenProgram || sourceInfo?.mint !== mint || sourceInfo?.owner !== from) {
      throw new Error("Source token account does not belong to the sender and requested mint");
    }
    if (!destinationValue || destinationValue.owner !== tokenProgram || destinationInfo?.mint !== mint || destinationInfo?.owner !== to) {
      throw new Error("Destination token account must already exist and belong to the recipient for this mint");
    }
    const available = sourceInfo?.tokenAmount?.amount;
    if (typeof available !== "string" || BigInt(available) < amount) throw new Error("Insufficient SPL token balance");
    const data = concat(Uint8Array.from([12]), u64le(amount), Uint8Array.from([decimals]));
    prepared = legacyTransaction([
      from,
      sourceTokenAccount,
      mint,
      destinationTokenAccount,
      tokenProgram,
    ], 1, blockhash, 4, [1, 2, 3, 0], data);
    tokenMint = mint;
  }
  return {
    chain: "solana",
    network: "mainnet",
    asset,
    token: tokenMint,
    tokenProgram,
    tokenDecimals: asset === "native" ? undefined : decimals,
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
