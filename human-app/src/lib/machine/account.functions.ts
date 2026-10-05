import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAccountAuth } from "@/integrations/auth/auth-middleware";

const QUOTE_HOURS = 24;

export const getAccountOverview = createServerFn({ method: "GET" })
  .middleware([requireAccountAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [account, keys, usage, payments, quotes] = await Promise.all([
      db.from("api_accounts").select("plan_id,quota,used,expires_at").eq("user_id", context.userId).maybeSingle(),
      db.from("api_account_keys").select("id,name,token_hint,created_at,last_used_at,revoked_at").eq("user_id", context.userId).order("created_at", { ascending: false }),
      db.from("api_usage_events").select("id,endpoint,chain,units,allowed,created_at,key_id").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(100),
      db.from("api_account_payments").select("id,chain,tx,payer,plan_id,amount_atomic,paid_at").eq("user_id", context.userId).order("paid_at", { ascending: false }),
      db.from("api_checkout_quotes").select("id,plan_id,chain,payer,created_at,expires_at,consumed_at").eq("user_id", context.userId).is("consumed_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(5),
    ]);
    const firstError = account.error ?? keys.error ?? usage.error ?? payments.error ?? quotes.error;
    if (firstError) throw new Error("Account data unavailable");
    return {
      account: account.data,
      keys: keys.data ?? [],
      usage: (usage.data ?? []).map((u) => ({ ...u, id: String(u.id) })),
      payments: (payments.data ?? []).map((p) => ({ ...p, amount_atomic: String(p.amount_atomic) })),
      quotes: quotes.data ?? [],
    };
  });

export const claimFreeUnits = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { FREE_UNITS, FREE_PLAN_ID } = await import("./config");
    const [{ data: existing }, { count }] = await Promise.all([
      db.from("api_accounts").select("user_id").eq("user_id", context.userId).maybeSingle(),
      db.from("api_account_payments").select("id", { count: "exact", head: true }).eq("user_id", context.userId),
    ]);
    if (existing || (count ?? 0) > 0) throw new Error("The free allowance is only for new accounts.");
    const expires = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
    const { error } = await db.from("api_accounts").insert({ user_id: context.userId, plan_id: FREE_PLAN_ID, quota: FREE_UNITS, used: 0, expires_at: expires });
    if (error) throw new Error("The free allowance is only for new accounts.");
    return { units: FREE_UNITS, expiresAt: expires };
  });

export const createAccountKey = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .validator((input) => z.object({ name: z.string().trim().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sha256, secretToken } = await import("./billing.server");
    const { count } = await supabaseAdmin.from("api_account_keys").select("id", { count: "exact", head: true }).eq("user_id", context.userId).is("revoked_at", null);
    if ((count ?? 0) >= 10) throw new Error("You can have at most 10 active keys. Revoke one first.");
    const apiKey = `baw_acct_${secretToken()}`;
    const { error } = await supabaseAdmin.from("api_account_keys").insert({ user_id: context.userId, name: data.name, token_hash: sha256(apiKey), token_hint: `${apiKey.slice(0, 13)}…${apiKey.slice(-4)}` });
    if (error) throw new Error("Key could not be created");
    return { apiKey };
  });

export const revokeAccountKey = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("api_account_keys").update({ revoked_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", context.userId).is("revoked_at", null);
    if (error) throw new Error("Key could not be revoked");
    return { revoked: true };
  });

export const createCheckoutQuote = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .validator((input) => z.object({ planId: z.enum(["builder", "pro", "scale"]), chain: z.enum(["base", "solana"]), payer: z.string().trim().min(26).max(64) }).parse(input))
  .handler(async ({ data, context }) => {
    const { machineChain, validAddress } = await import("./chains");
    const chain = machineChain(data.chain)!;
    if (!validAddress(chain, data.payer)) throw new Error(`That is not a valid ${chain.name} wallet address.`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payer = data.chain === "base" ? data.payer.toLowerCase() : data.payer;
    const { data: quote, error } = await supabaseAdmin.from("api_checkout_quotes")
      .insert({ user_id: context.userId, plan_id: data.planId, chain: data.chain, payer, expires_at: new Date(Date.now() + QUOTE_HOURS * 3600_000).toISOString() })
      .select("id,plan_id,chain,payer,created_at,expires_at,consumed_at").single();
    if (error || !quote) throw new Error("Checkout could not be started");
    return quote;
  });

export const confirmCheckout = createServerFn({ method: "POST" })
  .middleware([requireAccountAuth])
  .validator((input) => z.object({ quoteId: z.string().uuid(), tx: z.string().trim().min(40).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { planById } = await import("./config");
    const { machineChain, rpcUrl } = await import("./chains");
    const { verifyBaseReceipt, verifySolanaReceipt, PendingReceipt } = await import("./receipts.server");
    const { txAlreadyUsed } = await import("./billing.server");

    const { data: quote } = await db.from("api_checkout_quotes").select("*").eq("id", data.quoteId).eq("user_id", context.userId).maybeSingle();
    if (!quote || quote.consumed_at) throw new Error("This checkout is no longer open. Start a new one.");
    if (new Date(quote.expires_at).getTime() < Date.now()) throw new Error("This checkout expired. Start a new one.");
    const plan = planById(quote.plan_id);
    const chain = machineChain(quote.chain);
    if (!plan || !chain) throw new Error("Invalid checkout");
    const tx = quote.chain === "base" ? data.tx.toLowerCase() : data.tx;
    if (await txAlreadyUsed(quote.chain, tx)) throw new Error("That transaction has already been used.");

    const earliest = Math.floor(new Date(quote.created_at).getTime() / 1000) - 600;
    let paidAt: number;
    try {
      paidAt = quote.chain === "base"
        ? await verifyBaseReceipt(rpcUrl(chain), tx, quote.payer, earliest, plan.amountAtomic)
        : await verifySolanaReceipt(rpcUrl(chain), tx, quote.payer, earliest, plan.amountAtomic);
    } catch (error) {
      if (error instanceof PendingReceipt) return { status: "pending" as const, message: "Not confirmed on-chain yet. If you just sent it, wait a minute and press Verify again. If it still fails, check the transaction id and that it was sent from the wallet above." };
      throw new Error(error instanceof Error ? error.message : "Payment could not be verified");
    }

    const { data: activated, error } = await db.rpc("activate_api_checkout", {
      p_user_id: context.userId, p_quote_id: quote.id, p_tx: tx,
      p_paid_at: new Date(paidAt * 1000).toISOString(),
    });
    if (error || !activated) throw new Error("Payment could not be activated. The receipt may already be used; keep your transaction id.");
    return activated as { status: "unlocked"; plan: string; units: number; expiresAt: string };

  });
