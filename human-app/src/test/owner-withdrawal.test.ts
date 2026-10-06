// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareOwnerWithdrawal } from "@/lib/owner/withdrawal.server";
import { SOLANA_COLLECTOR, SOLANA_COLLECTOR_ATA, SOLANA_USDC } from "@/lib/machine/config";
import { TOKEN_PROGRAM } from "@/lib/owner/solana-message";
import { verifyWithdrawalQuote } from "@/lib/owner/signing";
let wrongNetwork = false;
let wrongTokenOwner = false;
let failedSimulation = false;
const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
  const { method, params } = JSON.parse(String(init?.body));
  const results: Record<string, unknown> = {
    eth_chainId: wrongNetwork ? "0x1" : "0x2105",
    eth_getTransactionCount: "0x0",
    eth_estimateGas: "0xf618",
    eth_maxPriorityFeePerGas: "0x1",
    eth_getBlockByNumber: { baseFeePerGas: "0x64" },
    eth_getBalance: "0xde0b6b3a7640000",
    eth_call: "0x4c4b40",
    getGenesisHash: wrongNetwork ? "wrong" : "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    getLatestBlockhash: { value: { blockhash: "11111111111111111111111111111111" } },
    getMinimumBalanceForRentExemption: 2039280,
    getFeeForMessage: { value: 5000 },
    getBalance: { value: 1000000000 },
    simulateTransaction: { value: { err: failedSimulation ? "InstructionError" : null } },
  };
  if (method === "getAccountInfo")
    results[method] = {
      value:
        params[0] === SOLANA_COLLECTOR_ATA
          ? {
              owner: TOKEN_PROGRAM,
              data: {
                parsed: {
                  info: {
                    owner: wrongTokenOwner ? "wrong" : SOLANA_COLLECTOR,
                    mint: SOLANA_USDC,
                    state: "initialized",
                    tokenAmount: { amount: "5000000", decimals: 6 },
                  },
                },
              },
            }
          : null,
    };
  return Response.json({ jsonrpc: "2.0", id: 1, result: results[method] });
});
beforeEach(() => {
  wrongNetwork = false;
  wrongTokenOwner = false;
  failedSimulation = false;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const baseIntent = {
  chain: "base",
  asset: "usdc",
  to: "0x1111111111111111111111111111111111111111",
  amount: "1.25",
};
const solIntent = {
  chain: "solana",
  asset: "usdc",
  to: "11111111111111111111111111111112",
  amount: "1.25",
};

it("prepares a fixed-collector USDC transfer that passes the device's independent review", async () => {
  const quote = await prepareOwnerWithdrawal(baseIntent);
  expect(quote.amountAtomic).toBe("1250000");
  await expect(verifyWithdrawalQuote(quote)).resolves.toBeUndefined();
  expect(fetchMock.mock.calls.every((call) => !String(call[1]?.body).includes("eth_send"))).toBe(
    true,
  );
});
it("rejects private-key fields, overprecision, insufficient token balances and spending the gas reserve", async () => {
  for (const intent of [
    { ...baseIntent, privateKey: "must-never-be-accepted" },
    { ...baseIntent, amount: "1.1234567" },
    { ...baseIntent, amount: "6" },
    { ...baseIntent, asset: "native", amount: "1" },
  ])
    await expect(prepareOwnerWithdrawal(intent)).rejects.toThrow();
});
it("blocks the wrong RPC network before returning any withdrawal transaction", async () => {
  wrongNetwork = true;
  for (const intent of [baseIntent, solIntent])
    await expect(prepareOwnerWithdrawal(intent)).rejects.toThrow("mismatch");
});
it("creates the receiver's USDC account idempotently and includes rent in the review", async () => {
  const quote = await prepareOwnerWithdrawal(solIntent);
  expect(quote.accountRentAtomic).toBe("2039280");
  await expect(verifyWithdrawalQuote(quote)).resolves.toBeUndefined();
  expect(
    fetchMock.mock.calls.some((call) => String(call[1]?.body).includes("simulateTransaction")),
  ).toBe(true);
  expect(
    fetchMock.mock.calls.every((call) => !String(call[1]?.body).includes('"sendTransaction"')),
  ).toBe(true);
});
it("blocks a substituted source token owner and failed Solana simulation", async () => {
  wrongTokenOwner = true;
  await expect(prepareOwnerWithdrawal(solIntent)).rejects.toThrow("token account");
  wrongTokenOwner = false;
  failedSimulation = true;
  await expect(prepareOwnerWithdrawal(solIntent)).rejects.toThrow("simulation");
});
