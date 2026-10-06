import { isAddress, parseUnits } from "ethers";
import { base64 } from "@scure/base";
import { z } from "zod";
import { machineChain, rpcUrl, validAddress } from "@/lib/machine/chains";
import {
  BASE_COLLECTOR,
  BASE_USDC,
  SOLANA_COLLECTOR,
  SOLANA_COLLECTOR_ATA,
  SOLANA_USDC,
} from "@/lib/machine/config";
import { prepareBaseTransaction } from "@/lib/machine/transactions.server";
import { treasurySolanaMessage, TOKEN_PROGRAM, usdcTokenAccount } from "./solana-message";
import type { WithdrawalQuote } from "./types";

const schema = z
  .object({
    chain: z.enum(["base", "solana"]),
    asset: z.enum(["usdc", "native"]),
    to: z.string().trim().max(64),
    amount: z.string().trim().max(40),
  })
  .strict();
async function rpc(url: string, method: string, params: unknown[]) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Network unavailable");
  const payload = (await response.json()) as any;
  if (payload.error || !("result" in payload)) throw new Error("Network request failed");
  return payload.result;
}
function tokenAccount(value: any, expectedOwner: string) {
  const info = value?.data?.parsed?.info;
  if (
    value?.owner !== TOKEN_PROGRAM ||
    info?.owner !== expectedOwner ||
    info?.mint !== SOLANA_USDC ||
    info?.state !== "initialized" ||
    !/^\d+$/.test(info?.tokenAmount?.amount ?? "") ||
    info?.tokenAmount?.decimals !== 6
  ) {
    throw new RangeError("The USDC token account does not match this receiving wallet");
  }
  return BigInt(info.tokenAmount.amount);
}

export async function prepareOwnerWithdrawal(input: unknown): Promise<WithdrawalQuote> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new RangeError("Choose a chain, asset, receiving address and amount");
  const { chain, asset, to, amount } = parsed.data;
  const definition = machineChain(chain)!;
  const from = chain === "base" ? BASE_COLLECTOR : SOLANA_COLLECTOR;
  if (
    !validAddress(definition, to) ||
    (chain === "base" && !isAddress(to)) ||
    (chain === "base" ? to.toLowerCase() === from.toLowerCase() : to === from) ||
    /^0x0{40}$/i.test(to) ||
    to.toLowerCase() === BASE_USDC.toLowerCase()
  )
    throw new RangeError("Enter a different valid receiving wallet address");
  const decimals = asset === "usdc" ? 6 : chain === "base" ? 18 : 9;
  if (!new RegExp(`^(?:0|[1-9]\\d{0,12})(?:\\.\\d{1,${decimals}})?$`).test(amount))
    throw new RangeError(`Use a positive amount with at most ${decimals} decimal places`);
  const atomic = parseUnits(amount, decimals);
  if (atomic <= 0n) throw new RangeError("Amount must be greater than zero");
  if (chain === "solana" && atomic > 0xffffffffffffffffn)
    throw new RangeError("Amount exceeds Solana's transaction limit");
  const common = {
    chain,
    asset,
    from,
    to,
    amount,
    amountAtomic: atomic.toString(),
    decimals,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    accountRentAtomic: "0",
  };
  const url = rpcUrl(definition);
  if (chain === "base") {
    const prepared = await prepareBaseTransaction(url, {
      from,
      to,
      asset,
      amountAtomic: atomic.toString(),
    });
    const fee =
      BigInt(prepared.unsignedTransaction.gas) * BigInt(prepared.unsignedTransaction.maxFeePerGas);
    const native = BigInt(await rpc(url, "eth_getBalance", [from, "pending"]));
    if (native < fee + (asset === "native" ? atomic : 0n))
      throw new RangeError("Leave enough ETH in the collector for the maximum network fee");
    if (asset === "usdc") {
      const balance = BigInt(
        await rpc(url, "eth_call", [
          { to: BASE_USDC, data: `0x70a08231${from.slice(2).toLowerCase().padStart(64, "0")}` },
          "latest",
        ]),
      );
      if (balance < atomic) throw new RangeError("Amount exceeds the collector's USDC balance");
    }
    return {
      ...common,
      networkFeeAtomic: fee.toString(),
      unsignedTransaction: prepared.unsignedTransaction,
    };
  }
  if ((await rpc(url, "getGenesisHash", [])) !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d")
    throw new Error("Solana network mismatch");
  const latest = await rpc(url, "getLatestBlockhash", [{ commitment: "confirmed" }]);
  const recentBlockhash = latest?.value?.blockhash;
  if (typeof recentBlockhash !== "string") throw new Error("Solana blockhash unavailable");
  let rent = 0n;
  if (asset === "usdc") {
    const destination = await usdcTokenAccount(to);
    const [source, target] = await Promise.all([
      rpc(url, "getAccountInfo", [
        SOLANA_COLLECTOR_ATA,
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]),
      rpc(url, "getAccountInfo", [
        destination,
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]),
    ]);
    if (tokenAccount(source.value, from) < atomic)
      throw new RangeError("Amount exceeds the collection token account's USDC balance");
    if (target.value) tokenAccount(target.value, to);
    else rent = BigInt(await rpc(url, "getMinimumBalanceForRentExemption", [165]));
  }
  const message = await treasurySolanaMessage({
    asset,
    to,
    amountAtomic: atomic.toString(),
    recentBlockhash,
  });
  const messageBase64 = base64.encode(message);
  const feeResponse = await rpc(url, "getFeeForMessage", [
    messageBase64,
    { commitment: "confirmed" },
  ]);
  if (!Number.isSafeInteger(feeResponse?.value) || feeResponse.value < 0)
    throw new Error("Solana fee unavailable");
  const fee = BigInt(feeResponse.value);
  const balance = await rpc(url, "getBalance", [from, { commitment: "confirmed" }]);
  if (BigInt(balance.value) < fee + rent + (asset === "native" ? atomic : 0n))
    throw new RangeError("Leave enough SOL for the network fee and any new USDC token account");
  const wire = Uint8Array.from([1, ...new Uint8Array(64), ...message]);
  const simulation = await rpc(url, "simulateTransaction", [
    base64.encode(wire),
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" },
  ]);
  if (simulation?.value?.err !== null)
    throw new RangeError(
      "The transfer simulation failed. Check balances and the receiving address",
    );
  return {
    ...common,
    recentBlockhash,
    messageBase64,
    networkFeeAtomic: fee.toString(),
    accountRentAtomic: rent.toString(),
  };
}
