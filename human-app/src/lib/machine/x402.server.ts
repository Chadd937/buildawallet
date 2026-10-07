import { x402HTTPResourceServer, x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { appDatabase } from "@/lib/db/context.server";
import { BASE_COLLECTOR, BASE_MAINNET, SOLANA_COLLECTOR, SOLANA_MAINNET } from "./config";

const FACILITATOR_URL = () => process.env.X402_FACILITATOR_URL?.trim() || "";
const FACILITATOR_AUTH = () => process.env.X402_FACILITATOR_AUTH?.trim() || "";

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
  getQueryParams: () => Object.fromEntries(new URL(request.url).searchParams.entries()),
  getQueryParam: (name: string) => new URL(request.url).searchParams.get(name) ?? undefined,
  getBody: () => undefined,
});

function makeServer() {
  const url = FACILITATOR_URL();
  if (!url) return null;
  const auth = FACILITATOR_AUTH();
  const facilitator = new HTTPFacilitatorClient({
    url,
    ...(auth
      ? {
          createAuthHeaders: async () => ({
            verify: { Authorization: `Bearer ${auth}` },
            settle: { Authorization: `Bearer ${auth}` },
            supported: { Authorization: `Bearer ${auth}` },
          }),
        }
      : {}),
  });
  const resource = new x402ResourceServer(facilitator)
    .register(BASE_MAINNET, new ExactEvmScheme())
    .register(SOLANA_MAINNET, new ExactSvmScheme());
  return resource;
}

export function x402Configured() {
  return Boolean(FACILITATOR_URL());
}

export async function x402Protect(request: Request, priceUSD: string, description: string): Promise<
  | { kind: "error"; response: Response }
  | { kind: "free" }
  | { kind: "paid"; payment: PaymentContext }
> {
  const resourceServer = makeServer();
  if (!resourceServer) {
    return {
      kind: "error",
      response: Response.json(
        {
          error: "Pay-per-call is not configured yet",
          code: "x402_facilitator_not_configured",
          configure: "Set X402_FACILITATOR_URL and redeploy.",
        },
        { status: 503 },
      ),
    };
  }
  const routes = {
    "* " + new URL(request.url).pathname: {
      accepts: [
        { scheme: "exact", price: priceUSD, network: BASE_MAINNET, payTo: BASE_COLLECTOR, maxTimeoutSeconds: 300 },
        { scheme: "exact", price: priceUSD, network: SOLANA_MAINNET, payTo: SOLANA_COLLECTOR, maxTimeoutSeconds: 300 },
      ],
      description,
      mimeType: "application/json",
      resource: request.url,
    },
  } as any;
  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  const result = await httpServer.processHTTPRequest({
    adapter: adapter(request),
    path: new URL(request.url).pathname,
    method: request.method,
    paymentHeader: request.headers.get("PAYMENT-SIGNATURE") ?? undefined,
  } as any);
  if (result.type === "payment-error") {
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
  }
  if (result.type === "no-payment-required")
    return { kind: "free" };
  return {
    kind: "paid",
    payment: {
      payload: result.paymentPayload,
      requirements: result.paymentRequirements,
      declaredExtensions: result.declaredExtensions,
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
  const network = String(result.network);
  const tx = String(result.transaction);
  const payer = result.payer ? String(result.payer) : null;
  try {
    await appDatabase()
      .prepare(
        "INSERT OR IGNORE INTO machine_x402_payments(id,network,tx,payer,amount_atomic,resource) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        network,
        tx,
        payer,
        String(payment.requirements.amount),
        payment.requirements.payTo,
      )
      .run();
  } catch {
    // Settlement already happened; persistence failure must not cause a second settlement.
  }
  return { ok: true as const, headers: result.headers };
}
