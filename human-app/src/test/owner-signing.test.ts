// @vitest-environment node
import { expect, it, vi } from "vitest";
import { Interface } from "ethers";
import { base64 } from "@scure/base";
import { BASE_COLLECTOR, BASE_USDC, SOLANA_COLLECTOR } from "@/lib/machine/config";
import {
  connectCollector,
  signReviewedWithdrawal,
  verifyWithdrawalQuote,
  type EvmProvider,
} from "@/lib/owner/signing";
import { treasurySolanaMessage } from "@/lib/owner/solana-message";
import type { WithdrawalQuote } from "@/lib/owner/types";
const recipient = "0x1111111111111111111111111111111111111111";
const quote = (): WithdrawalQuote => ({
  chain: "base",
  asset: "usdc",
  from: BASE_COLLECTOR,
  to: recipient,
  amount: "1.25",
  amountAtomic: "1250000",
  decimals: 6,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  accountRentAtomic: "0",
  networkFeeAtomic: "63000000",
  unsignedTransaction: {
    from: BASE_COLLECTOR,
    to: BASE_USDC,
    value: "0x0",
    data: new Interface(["function transfer(address to,uint256 amount)"]).encodeFunctionData(
      "transfer",
      [recipient, "1250000"],
    ),
    chainId: "0x2105",
    gas: "0xf618",
    maxFeePerGas: "0x3e8",
    maxPriorityFeePerGas: "0x1",
    nonce: "0x0",
    type: "0x2",
  },
});
function provider(account = BASE_COLLECTOR, chain = "0x2105") {
  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
      if (method === "eth_chainId") return chain;
      if (method === "eth_sendTransaction") return "0x" + "a".repeat(64);
      return null;
    }),
  } as EvmProvider & { request: ReturnType<typeof vi.fn> };
}
it("sends only the reviewed transfer through the device wallet, without any private-key request", async () => {
  const wallet = provider();
  expect(await signReviewedWithdrawal(quote(), { evm: wallet, solana: undefined })).toBe(
    "0x" + "a".repeat(64),
  );
  expect(wallet.request.mock.calls.map((call) => call[0].method)).toEqual([
    "eth_accounts",
    "eth_chainId",
    "eth_sendTransaction",
  ]);
});
it("rejects a wrong connected account, a changed account and a wrong network before sending", async () => {
  const wrong = provider(recipient);
  await expect(connectCollector("base", { evm: wrong, solana: undefined })).rejects.toThrow(
    "collector",
  );
  for (const wallet of [provider(recipient), provider(BASE_COLLECTOR, "0x1")]) {
    await expect(
      signReviewedWithdrawal(quote(), { evm: wallet, solana: undefined }),
    ).rejects.toThrow("changed");
    expect(wallet.request.mock.calls.some((call) => call[0].method === "eth_sendTransaction")).toBe(
      false,
    );
  }
});
it("rejects altered destinations, amounts, fees, arbitrary calldata and expired reviews", async () => {
  const original = quote();
  const changes = [
    { ...original, amount: "0.25" },
    { ...original, networkFeeAtomic: "1" },
    { ...original, expiresAt: new Date(0).toISOString() },
    { ...original, unsignedTransaction: { ...original.unsignedTransaction!, to: recipient } },
    { ...original, unsignedTransaction: { ...original.unsignedTransaction!, data: "0xdeadbeef" } },
  ];
  for (const changed of changes) await expect(verifyWithdrawalQuote(changed)).rejects.toThrow();
});
it("checks the full Solana instruction message instead of trusting an opaque transaction", async () => {
  const to = "11111111111111111111111111111112";
  const recentBlockhash = "11111111111111111111111111111111";
  const message = await treasurySolanaMessage({
    asset: "usdc",
    to,
    amountAtomic: "1250000",
    recentBlockhash,
  });
  const review: WithdrawalQuote = {
    chain: "solana",
    asset: "usdc",
    from: SOLANA_COLLECTOR,
    to,
    amount: "1.25",
    amountAtomic: "1250000",
    decimals: 6,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    accountRentAtomic: "2039280",
    networkFeeAtomic: "5000",
    recentBlockhash,
    messageBase64: base64.encode(message),
  };
  await expect(verifyWithdrawalQuote(review)).resolves.toBeUndefined();
  const changed = message.slice();
  changed[changed.length - 2] = changed[changed.length - 2]! ^ 1;
  await expect(
    verifyWithdrawalQuote({ ...review, messageBase64: base64.encode(changed) }),
  ).rejects.toThrow("review");
});
