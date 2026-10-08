import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";
import { x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { appDatabase } from "@/lib/db/context.server";
import { recordAgentPayment } from "./billing.server";
import { EVM_MAINNETS, BASE_COLLECTOR, SOLANA_COLLECTOR, SOLANA_MAINNET } from "./config";

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
): Promise<
  | { kind: "error"; response: Response }
  | { kind: "paid"; payment: PaymentContext }
> {
  const resourceServer = makeServer();
  if (!resourceServer)
    return {
      kind: "error",
      response: Response.json(
        {
          error: "Pay-per-call is not configured yet",
          code: "x402_facilitator_not_configured",
          configure: "Set CDP_API_KEY_ID and CDP_API_KEY_SECRET and redeploy.",
        },
        { status: 503 },
      ),
    };

  const routes = {
    "*": {
      accepts: [
        {
          scheme: "exact",
          price: priceUSD,
          network: EVM_MAINNETS.ethereum,
          payTo: BASE_COLLECTOR,
          maxTimeoutSeconds: 300,
        },
        {
          scheme: "exact",
          price: priceUSD,
          network: EVM_MAINNETS.base,
          payTo: BASE_COLLECTOR,
          maxTimeoutSeconds: 300,
        },
        {
          scheme: "exact",
          price: priceUSD,
          network: EVM_MAINNETS.arbitrum,
          payTo: BASE_COLLECTOR,
          maxTimeoutSeconds: 300,
        },
        {
          scheme: "exact",
          price: priceUSD,
          network: EVM_MAINNETS.optimism,
          payTo: BASE_COLLECTOR,
          maxTimeoutSeconds: 300,
        },
        {
          scheme: "exact",
          price: priceUSD,
          network: EVM_MAINNETS.polygon,
          payTo: BASE_COLLECTOR,
          maxTimeoutSeconds: 300,
        },
        {
          scheme: "exact",
          price: priceUSD,
          network: EVM_MAINNETS.bnb,
          payTo: BASE_COLLECTOR,
          maxTimeoutSeconds: 300,
        },
        {
          scheme: "exact",
          price: priceUSD,
          network: EVM_MAINNETS.avalanche,
          payTo: BASE_COLLECTOR,
          maxTimeoutSeconds: 300,
        },
        {
          scheme: "exact",
          price: priceUSD,
          network: SOLANA_MAINNET,
          payTo: SOLANA_COLLECTOR,
          maxTimeoutSeconds: 300,
        },
      ],
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
