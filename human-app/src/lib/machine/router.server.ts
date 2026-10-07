import { authenticate } from "./auth.server";
import {
  consumeApiKey,
  confirmPayment,
  issueApiKey,
  issueChallenge,
  revokeApiKey,
  session,
  statusForSession,
  createMachineAccessQuote,
  activateMachineAccessQuote,
  machineAccessQuote,
} from "./billing.server";
import { MACHINE_CHAINS, machineChain, rpcUrl, validAddress } from "./chains";
import {
  BASE_COLLECTOR,
  BASE_USDC,
  PLANS,
  SOLANA_COLLECTOR,
  SOLANA_USDC,
  planById,
  publicPlans,
  PREPAID_BILLING,
} from "./config";
import {
  configuredNetworks,
  portfolio,
  readStablecoin,
  readTransaction,
  readWallet,
  snapshot,
} from "./data.server";
import { apiError, cors, json, objectBody } from "./http";
import { x402Protect, x402Settle } from "./x402.server";
import { PendingReceipt, verifyBaseReceipt, verifySolanaReceipt } from "./receipts.server";
import {
  broadcastBaseTransaction,
  broadcastSolanaTransaction,
  prepareBaseTransaction,
  prepareSolanaTransaction,
  type PrepareIntent,
} from "./transactions.server";
import { handleWalletRoute } from "./wallets.server";

const segments = (request: Request) =>
  new URL(request.url).pathname
    .replace(/^\/api\/public(?=\/machine(?:\/|$))/, "")
    .split("/")
    .filter(Boolean);
const authError = () => json({ error: "Valid bearer credential required" }, 401, cors);
const subscriptionRead = async (
  request: Request,
  cost: number,
  work: () => Promise<unknown>,
  chain = "",
  reserveBeforeWork = false,
) => {
  const access = await consumeApiKey(request, 0);
  let payment: Awaited<ReturnType<typeof x402Protect>> | null = null;
  if (!access && cost > 0) {
    payment = await x402Protect(request, "$0.01", "BuildAWallet machine API request");
    if (payment.kind === "error") {
      const response = payment.response;
      Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    }
  }
  if (!access && !payment) return authError();
  if (access && cost > 0 && access.remaining < cost)
    return json({ error: "API unit quota exhausted" }, 429, cors);
  let usage: Awaited<ReturnType<typeof consumeApiKey>> = access;
  if (reserveBeforeWork && cost > 0) {
    usage = await consumeApiKey(request, cost, { endpoint: new URL(request.url).pathname, chain });
    if (!usage) return authError();
    if (!usage.allowed) return json({ error: "API unit quota exhausted" }, 429, cors);
  }
  let result: unknown;
  try {
    result = await work();
  } catch (error) {
    throw error;
  }
  if (!access && payment?.kind === "paid") {
    const settled = await x402Settle(payment.payment);
    if (!settled.ok) return settled.response;
    const response = json({ ...(result as object), payment: { mode: "x402", settlement: true } }, 200, cors);
    Object.entries(settled.headers).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  if (!reserveBeforeWork && cost > 0)
    usage = await consumeApiKey(request, cost, { endpoint: new URL(request.url).pathname, chain });
  if (!usage) return authError();
  if (!usage.allowed)
    return json(
      {
        error: "API unit quota exhausted",
        usage: {
          plan: usage.plan_id,
          used: usage.used,
          remaining: usage.remaining,
          quota: usage.quota,
        },
      },
      429,
      cors,
    );
  return json(
    {
      ...(result as object),
      usage: {
        plan: usage.plan_id,
        used: usage.used,
        remaining: usage.remaining,
        quota: usage.quota,
        expiresAt: usage.expires_at,
      },
    },
    200,
    cors,
  );
};
export async function handleMachineRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const parts = segments(request);
    if (parts[0] !== "machine") return json({ error: "Not found" }, 404, cors);
    if (parts[1] === "x402" || parts[1] === "wallet" || parts[1] === "solana-wallet") {
      return json(
        {
          error:
            "Per-call blockchain payments have been retired. Buy prepaid API units and use a bearer API key.",
          code: "per_call_payments_retired",
          billing: PREPAID_BILLING,
          replacement: "/machine/v1/{chain}/wallet/{address}",
          paymentAccepted: false,
        },
        410,
        cors,
      );
    }
    if (parts[1] !== "v1") return json({ error: "Not found" }, 404, cors);
    const tail = parts.slice(2);
    if (request.method === "GET" && tail.join("/") === "agent/bootstrap")
      return json({
        service: "BuildAWallet Machine API",
        version: "4.0.0",
        mode: "machine-native",
        discovery: {
          llms: "/llms.txt",
          manifest: "/.well-known/agent.json",
          openapi: "/openapi.json",
          mcp: "/mcp",
          pricing: "/nonhuman/pricing",
        },
        onboarding: {
          quote: "POST /machine/v1/agent/quote",
          activate: "POST /machine/v1/agent/activate",
          x402: "PAYMENT-SIGNATURE on metered endpoints",
        },
        payment: {
          prepaid: true,
          x402: true,
          settlementChains: ["base", "solana"],
          asset: "USDC",
        },
        custody: "non-custodial",
        signing: "caller-controlled",
      }, 200, cors);
    if (request.method === "POST" && tail.join("/") === "agent/quote") {
      const body = await objectBody(request);
      const chain = body["chain"];
      const wallet = body["wallet"];
      const plan = body["planId"];
      const selected = typeof chain === "string" ? machineChain(chain) : undefined;
      if ((chain !== "base" && chain !== "solana") || typeof wallet !== "string" || !selected || !validAddress(selected, wallet))
        throw new RangeError("Valid Base or Solana wallet required");
      if (typeof plan !== "string") throw new RangeError("planId required");
      return json(await createMachineAccessQuote(chain, chain === "base" ? wallet.toLowerCase() : wallet, plan as any), 201, cors);
    }
    if (request.method === "POST" && tail.join("/") === "agent/activate") {
      const body = await objectBody(request);
      if (typeof body["quoteId"] !== "string" || typeof body["tx"] !== "string")
        throw new RangeError("quoteId and tx required");
      const quote = await machineAccessQuote(body["quoteId"]);
      if (!quote) throw new RangeError("Quote is invalid, expired or already consumed");
      const paymentChain = machineChain(quote.chain);
      if (!paymentChain) throw new RangeError("Unsupported payment chain");
      const paidAt =
        quote.chain === "base"
          ? await verifyBaseReceipt(
              rpcUrl(paymentChain),
              body["tx"],
              quote.wallet,
              Math.floor(new Date(quote.created_at).getTime() / 1000),
              BigInt(quote.amount_atomic),
            )
          : await verifySolanaReceipt(
              rpcUrl(paymentChain),
              body["tx"],
              quote.wallet,
              Math.floor(new Date(quote.created_at).getTime() / 1000),
              BigInt(quote.amount_atomic),
            );
      return json(await activateMachineAccessQuote(body["quoteId"], body["tx"], paidAt), 200, cors);
    }
    if (request.method === "GET" && tail[0] === "chains")
      return json(
        {
          chains: MACHINE_CHAINS.map(({ env: _env, fallback: _fallback, ...chain }) => chain),
          configured: configuredNetworks(),
          settlementChains: ["base", "solana"],
        },
        200,
        cors,
      );
    if (request.method === "GET" && tail[0] === "plans")
      return json(
        {
          plans: publicPlans(),
          billing: PREPAID_BILLING,
          payment: {
            base: { asset: BASE_USDC, collector: BASE_COLLECTOR },
            solana: { asset: SOLANA_USDC, collector: SOLANA_COLLECTOR },
          },
        },
        200,
        cors,
      );
    if (request.method === "POST" && tail.join("/") === "auth/challenge") {
      const body = await objectBody(request),
        chain = body["chain"],
        wallet = body["wallet"];
      const settlementChain = typeof chain === "string" ? machineChain(chain) : undefined;
      if (
        (chain !== "base" && chain !== "solana") ||
        typeof wallet !== "string" ||
        !settlementChain ||
        !validAddress(settlementChain, wallet)
      )
        throw new RangeError("Valid Base or Solana wallet required");
      return json(
        await issueChallenge(chain, chain === "base" ? wallet.toLowerCase() : wallet),
        200,
        cors,
      );
    }
    if (request.method === "POST" && tail.join("/") === "auth/verify") {
      const body = await objectBody(request);
      if (typeof body["nonce"] !== "string" || typeof body["signature"] !== "string")
        throw new RangeError("nonce and signature required");
      return json(await authenticate(body["nonce"], body["signature"]), 200, cors);
    }
    if (request.method === "GET" && tail[0] === "subscription") {
      const status = await statusForSession(request);
      return status ? json(status, 200, cors) : authError();
    }
    if (request.method === "POST" && tail.join("/") === "subscription/confirm") {
      const identity = await session(request);
      if (!identity) return authError();
      const body = await objectBody(request),
        plan = planById(body["planId"]);
      if (!plan || typeof body["tx"] !== "string")
        throw new RangeError("Valid planId and transaction required");
      const paymentChain = machineChain(identity.chain);
      if (!paymentChain) throw new RangeError("Unsupported payment chain");
      const paidAt =
        identity.chain === "base"
          ? await verifyBaseReceipt(
              rpcUrl(paymentChain),
              body["tx"],
              identity.wallet,
              Math.floor(new Date(identity.issued_at).getTime() / 1000),
              plan.amountAtomic,
            )
          : await verifySolanaReceipt(
              rpcUrl(paymentChain),
              body["tx"],
              identity.wallet,
              Math.floor(new Date(identity.issued_at).getTime() / 1000),
              plan.amountAtomic,
            );
      return json(
        await confirmPayment(request, body["tx"], plan.id, paidAt, plan.amountAtomic),
        200,
        cors,
      );
    }
    if (tail.join("/") === "subscription/key" && request.method === "POST") {
      const result = await issueApiKey(request);
      return result ? json(result, 201, cors) : authError();
    }
    if (tail.join("/") === "subscription/key" && request.method === "DELETE") {
      const result = await revokeApiKey(request);
      return result ? json(result, 200, cors) : authError();
    }
    if (request.method === "GET" && tail[0] === "usage") {
      const usage = await consumeApiKey(request, 0);
      return usage
        ? json(
            {
              plan: usage.plan_id,
              quota: usage.quota,
              used: usage.used,
              remaining: usage.remaining,
              batchLimit: usage.batch_limit,
              expiresAt: usage.expires_at,
            },
            200,
            cors,
          )
        : authError();
    }
    if (tail[0] === "wallets") {
      const handled = await handleWalletRoute(request, tail.slice(1));
      if (handled) return handled;
    }
    if (request.method === "GET" && tail[0] === "portfolio" && tail[1])
      return subscriptionRead(request, 1, () => portfolio(decodeURIComponent(tail[1]!)), "all");
    const [chainId, kind, value] = tail;
    if (request.method === "GET" && value) {
      if (kind === "wallet")
        return subscriptionRead(
          request,
          1,
          () => readWallet(chainId ?? "", decodeURIComponent(value)),
          chainId,
        );
      if (kind === "stablecoin")
        return subscriptionRead(
          request,
          1,
          () => readStablecoin(chainId ?? "", decodeURIComponent(value)),
          chainId,
        );
      if (kind === "transaction")
        return subscriptionRead(
          request,
          1,
          () => readTransaction(chainId ?? "", decodeURIComponent(value)),
          chainId,
        );
      if (kind === "snapshot")
        return subscriptionRead(
          request,
          1,
          () => snapshot(chainId ?? "", decodeURIComponent(value)),
          chainId,
        );
    }
    if (
      request.method === "POST" &&
      (chainId === "base" || chainId === "solana") &&
      kind === "transaction" &&
      value === "prepare"
    ) {
      const body = (await objectBody(request)) as PrepareIntent;
      const selectedChain = machineChain(chainId);
      if (!selectedChain) throw new RangeError("Unsupported transaction chain");
      return subscriptionRead(
        request,
        1,
        () =>
          chainId === "base"
            ? prepareBaseTransaction(rpcUrl(selectedChain), body)
            : prepareSolanaTransaction(rpcUrl(selectedChain), body),
        chainId,
      );
    }
    if (
      request.method === "POST" &&
      (chainId === "base" || chainId === "solana") &&
      kind === "transaction" &&
      value === "broadcast"
    ) {
      const body = await objectBody(request);
      const selectedChain = machineChain(chainId);
      if (!selectedChain) throw new RangeError("Unsupported transaction chain");
      return subscriptionRead(
        request,
        1,
        () =>
          chainId === "base"
            ? broadcastBaseTransaction(
                rpcUrl(selectedChain),
                String(body["signedTransaction"] ?? ""),
              )
            : broadcastSolanaTransaction(
                rpcUrl(selectedChain),
                String(body["signedTransactionBase64"] ?? ""),
              ),
        chainId,
        true,
      );
    }
    return json({ error: "Not found" }, 404, cors);
  } catch (error) {
    if (error instanceof PendingReceipt)
      return json({ status: "pending", message: error.message }, 202, cors);
    const response = apiError(error);
    Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
}
