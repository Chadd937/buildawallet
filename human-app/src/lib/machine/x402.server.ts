import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";
import { x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { appDatabase } from "@/lib/db/context.server";
import { recordAgentPayment } from "./billing.server";
import { EVM_MAINNETS, SOLANA_MAINNET } from "./config";
import { sameChainPaymentPolicy, x402Eligible } from "./payment-policy";

type PaymentContext = {
  payload: any;
  requirements: any;
  declaredExtensions?: Record<string, unknown>;
  httpServer: x402HTTPResourceServer;
};

const adapter = (request: Request) => ({
  getHeader: (name: string) => request.headers.get(name) ?? undefined,
  getMethod: () => request.method,
  getPath: () => new URL(request.url).pathname,
  getUrl: () => request.url,
  getAcceptHeader: () => request.headers.get("accept") ?? "",
  getUserAgent: () => request.headers.get("user-agent") ?? "",
  getQueryParams: () => Object.fromEntries(new URL(request.url).searchParams.entries()),
  getQueryParam: (name: string) => new URL(request.url).searchParams.get(name) ?? undefined,
  getBody: async () => undefined,
});

function makeServer() {
  if (!process.env["CDP_API_KEY_ID"]?.trim() || !process.env["CDP_API_KEY_SECRET"]?.trim()) return null;
  const facilitator = createCdpFacilitatorClient();
  const server = new x402ResourceServer(facilitator);
  for (const network of Object.values(EVM_MAINNETS)) {
    server.register(network, new ExactEvmScheme());
  }
  server.register(SOLANA_MAINNET, new ExactSvmScheme());
  return server;
}

export function x402Configured() {
  return Boolean(process.env["CDP_API_KEY_ID"]?.trim() && process.env["CDP_API_KEY_SECRET"]?.trim());
}

export async function x402Protect(
  request: Request,
  priceUSD: string,
  description: string,
  serviceChain: string,
): Promise<
  | { kind: "error"; response: Response }
  | { kind: "paid"; payment: PaymentContext }
> {
  let policy: ReturnType<typeof sameChainPaymentPolicy>;
  try {
    policy = sameChainPaymentPolicy(serviceChain);
  } catch {
    return { kind: "error", response: Response.json({
      error: "Valid service chain required for same-chain payment",
      code: "invalid_payment_chain",
    }, { status: 400 }) };
  }

  // Never advertise an x402 rail we cannot settle. Bitcoin and EVM networks
  // without documented CDP support use the existing verified same-chain prepaid
  // quote -> on-chain transfer -> activation -> API key workflow.
  if (!x402Eligible(serviceChain)) {
    return {
      kind: "error",
      response: Response.json({
        error: "Use a same-chain prepaid payment for this service",
        code: "same_chain_prepaid_required",
        payment: policy,
      }, { status: 402, headers: { "Cache-Control": "no-store" } }),
    };
  }

  const resourceServer = makeServer();
  if (!resourceServer) {
    return {
      kind: "error",
      response: Response.json({
        error: "Instant x402 is unavailable; same-chain prepaid access is available",
        code: "x402_facilitator_not_configured",
        payment: policy,
      }, { status: 402, headers: { "Cache-Control": "no-store" } }),
    };
  }

  const routes = {
    "*": {
      accepts: [{
        scheme: "exact",
        price: priceUSD,
        network: policy.network,
        payTo: policy.collector,
        maxTimeoutSeconds: 300,
      }],
      description,
      mimeType: "application/json",
      resource: request.url,
    },
  } as any;

  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  const paymentHeader = request.headers.get("PAYMENT-SIGNATURE") ?? undefined;
  const result = await httpServer.processHTTPRequest({
    adapter: adapter(request),
    path: new URL(request.url).pathname,
    method: request.method,
    ...(paymentHeader !== undefined ? { paymentHeader } : {}),
  });

  if (result.type === "payment-error")
    return {
      kind: "error",
      response: new Response(
        result.response.body === undefined ? null : JSON.stringify(result.response.body),
        {
          status: result.response.status,
          headers: {
            "content-type": "application/json",
            ...result.response.headers,
          },
        },
      ),
    };

  if (result.type !== "payment-verified")
    return {
      kind: "error",
      response: Response.json(
        { error: "x402 payment verification did not produce an authenticated payment" },
        { status: 402 },
      ),
    };

  return {
    kind: "paid",
    payment: {
      payload: result.paymentPayload,
      requirements: result.paymentRequirements,
      ...(result.declaredExtensions !== undefined
        ? { declaredExtensions: result.declaredExtensions }
        : {}),
      httpServer,
    },
  };
}

export async function x402Settle(payment: PaymentContext) {
  const result = await payment.httpServer.processSettlement(
    payment.payload,
    payment.requirements,
    payment.declaredExtensions,
  );
  if (!result.success)
    return {
      ok: false as const,
      response: Response.json(
        {
          error: "Payment settlement failed",
          code: result.errorReason,
          transaction: result.transaction ?? null,
          network: result.network ?? null,
        },
        { status: 402 },
      ),
    };

  try {
    await appDatabase()
      .prepare(
        "INSERT OR IGNORE INTO machine_x402_payments(id,network,tx,payer,amount_atomic,resource) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        String(result.network),
        String(result.transaction),
        result.payer ? String(result.payer) : null,
        String(payment.requirements.amount),
        payment.requirements.payTo,
      )
      .run();
  } catch {
    // Settlement already happened; never attempt a second settlement because persistence failed.
  }
  try {
    await recordAgentPayment(
      "x402",
      String(result.network),
      String(result.transaction),
      result.payer ? String(result.payer) : null,
      payment.requirements.payTo,
      String(payment.requirements.amount),
      1,
    );
  } catch {
    // Payment settlement is authoritative; ledger persistence must never trigger a second settlement.
  }
  return { ok: true as const, headers: result.headers };
}
