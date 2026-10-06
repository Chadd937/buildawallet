import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PAYMENT_CHAINS } from "./config";
import { requireAccountAuth } from "@/integrations/auth/auth-middleware";

export const getAccountOverview = createServerFn({ method: "GET" })
  .middleware([requireAccountAuth])
  .handler(async ({ context }) => {
    const { accountOverview } = await import("@/lib/db/storage.server");
    return accountOverview(context.userId);
  });

export const claimFreeUnits = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .handler(async ({ context }) => {
    const { claimWelcomeUnits } = await import("@/lib/db/storage.server");
    return claimWelcomeUnits(context.userId);
  });

export const createAccountKey = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .validator((input) => z.object({ name: z.string().trim().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { storeAccountKey } = await import("@/lib/db/storage.server");
    const { sha256, secretToken } = await import("./billing.server");
    const apiKey = `baw_acct_${secretToken()}`;
    await storeAccountKey(
      context.userId,
      data.name,
      sha256(apiKey),
      `${apiKey.slice(0, 13)}…${apiKey.slice(-4)}`,
    );
    return { apiKey };
  });

export const revokeAccountKey = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { revokeStoredAccountKey } = await import("@/lib/db/storage.server");
    await revokeStoredAccountKey(context.userId, data.id);
    return { revoked: true };
  });

export const createCheckoutQuote = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .validator((input) =>
    z
      .object({
        planId: z.enum(["builder", "pro", "scale"]),
        chain: z.enum(PAYMENT_CHAINS),
        payer: z.string().trim().min(26).max(64),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { machineChain, validAddress } = await import("./chains");
    const chain = machineChain(data.chain)!;
    if (!validAddress(chain, data.payer))
      throw new Error(`That is not a valid ${chain.name} wallet address.`);
    const { storeCheckoutQuote } = await import("@/lib/db/storage.server");
    const payer = chain.family === "evm" ? data.payer.toLowerCase() : data.payer;
    return storeCheckoutQuote(context.userId, data.planId, data.chain, payer);
  });

export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .validator((input) =>
    z.object({ quoteId: z.string().uuid(), tx: z.string().trim().min(40).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { checkoutQuote, activateCheckout } = await import("@/lib/db/storage.server");
    const { planById } = await import("./config");
    const { machineChain, rpcUrl } = await import("./chains");
    const { verifyEvmReceipt, verifySolanaReceipt, verifyTronReceipt, PendingReceipt } =
      await import("./receipts.server");
    const { txAlreadyUsed } = await import("./billing.server");

    const quote = await checkoutQuote(context.userId, data.quoteId);
    if (!quote || quote.consumed_at)
      throw new Error("This checkout is no longer open. Start a new one.");
    if (new Date(quote.expires_at).getTime() < Date.now())
      throw new Error("This checkout expired. Start a new one.");
    const plan = planById(quote.plan_id);
    const chain = machineChain(quote.chain);
    if (!plan || !chain) throw new Error("Invalid checkout");
    const tx = chain.family === "evm" ? data.tx.toLowerCase() : data.tx;
    if (await txAlreadyUsed(quote.chain, tx))
      throw new Error("That transaction has already been used.");

    const earliest = Math.floor(new Date(quote.created_at).getTime() / 1000) - 600;
    let paidAt: number;
    try {
      if (chain.family === "evm") {
        paidAt = await verifyEvmReceipt(
          rpcUrl(chain),
          chain,
          tx,
          quote.payer,
          earliest,
          plan.amountAtomic,
        );
      } else if (chain.family === "solana") {
        paidAt = await verifySolanaReceipt(
          rpcUrl(chain),
          tx,
          quote.payer,
          earliest,
          plan.amountAtomic,
        );
      } else if (chain.family === "tron") {
        paidAt = await verifyTronReceipt(
          rpcUrl(chain),
          tx,
          quote.payer,
          earliest,
          plan.amountAtomic,
        );
      } else {
        throw new Error(
          "Bitcoin subscription verification is not enabled yet; use an EVM, Solana, or Tron payment.",
        );
      }
    } catch (error) {
      if (error instanceof PendingReceipt)
        return {
          status: "pending" as const,
          message:
            "Not confirmed on-chain yet. If you just sent it, wait a minute and press Verify again. If it still fails, check the transaction id and that it was sent from the wallet above.",
        };
      throw new Error(error instanceof Error ? error.message : "Payment could not be verified");
    }

    try {
      return await activateCheckout(
        context.userId,
        quote.id,
        tx,
        new Date(paidAt * 1000).toISOString(),
      );
    } catch {
      throw new Error(
        "Payment could not be activated. The receipt may already be used; keep your transaction id.",
      );
    }
  });
