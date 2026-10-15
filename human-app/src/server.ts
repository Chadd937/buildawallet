import { withWorkerEnvironment, type WorkerEnvironment } from "./lib/db/context.server";
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

const machinePath = (path: string) =>
  path === "/machine" || path.startsWith("/machine/") ||
  path === "/api/public/machine" || path.startsWith("/api/public/machine/");

async function machineResponse(request: Request) {
  const { handleMachineRequest } = await import("./lib/machine/router.server");
  return handleMachineRequest(request);
}

async function discoveryResponse(path: string) {
  const { llms, offer, openapi } = await import("./lib/machine/spec");
  // The old root discovery documents deliberately remain attached to the
  // original two-chain Worker. The scoped alias is the NEW nine-chain product.
  const scoped = "/api/public/machine";
  const rewrite = (value: string) =>
    value.replaceAll("/machine/v1", scoped + "/v1")
      .replaceAll("https://buildawallet.xyz/mcp", "https://buildawallet.xyz/api/public/mcp")
      .replaceAll("https://buildawallet.xyz/openapi.json", "https://buildawallet.xyz/api/public/machine/openapi.json")
      .replaceAll("https://buildawallet.xyz/.well-known/agent.json", "https://buildawallet.xyz/api/public/machine/agent.json");
  const scopedPaths = Object.fromEntries(
    Object.entries(openapi.paths).map(([path, methods]) => [path.replace("/machine/v1", scoped + "/v1"), methods]),
  );
  if (path === scoped + "/openapi.json")
    return Response.json({ ...openapi, paths: scopedPaths }, {
      headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
    });
  if (path === scoped + "/agent.json") {
    const scopedOffer = JSON.parse(rewrite(JSON.stringify(offer))) as typeof offer;
    return Response.json({
      ...scopedOffer,
      version: "4.1.0",
      api: "https://buildawallet.xyz" + scoped + "/v1",
      mcp: "https://buildawallet.xyz/api/public/mcp",
      openapi: "https://buildawallet.xyz" + scoped + "/openapi.json",
      billing: {
        ...scopedOffer.billing,
        machineBootstrap: "https://buildawallet.xyz" + scoped + "/v1/agent/bootstrap",
        quote: "https://buildawallet.xyz" + scoped + "/v1/agent/quote",
        activate: "https://buildawallet.xyz" + scoped + "/v1/agent/activate",
        rule: "Pay on the requested blockchain; EVM/Solana use their native USDC, Bitcoin uses BTC. New subscriptions use the $15/$49/$149 plans.",
      },
      x402: { ...scopedOffer.x402,
        documentedNetworks: ["base", "polygon", "solana"],
        note: "Only advertise instant settlement when supported by the current facilitator; other networks use verified prepaid purchase on the same chain." },
    }, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" } });
  }
  if (path === scoped + "/llms.txt") return new Response(rewrite(llms), {
    headers: { "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
  });
  if (path === "/openapi.json" || path === "/machine/openapi.json")
    return Response.json(openapi, {
      headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
    });
  if (path === "/.well-known/agent.json" || path === "/agent-offer.json")
    return Response.json(offer, {
      headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
    });
  if (path === "/llms.txt")
    return new Response(llms, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
      },
    });
  return null;
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} ,  try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    return withWorkerEnvironment(env as WorkerEnvironment, async () => {
      try {
        const path = new URL(request.url).pathname;
        const ownerPath = path === "/owner" || path.startsWith("/owner/");
        if (ownerPath) {
          const { handleOwnerRequest } = await import("./lib/owner/http.server");
          const owner = await handleOwnerRequest(request);
          if (owner) return owner;
        }
        const aliases: Record<string, string> = {
          "/login": "/human/setup",
          "/signin": "/human/setup",
          "/account": "/human/setup",
          "/pricing": "/nonhuman/pricing",
          "/docs": "/nonhuman/api",
          "/docs/api": "/nonhuman/api",
          "/api-docs": "/nonhuman/api",
          "/pay": "/nonhuman/dashboard",
        };
        if (aliases[path]) return Response.redirect(new URL(aliases[path], request.url), 302);
        const discovery = await discoveryResponse(path);
        if (discovery) return discovery;
        if (path === "/mcp" || path === "/api/public/mcp") {
          const { handleMcp } = await import("./lib/machine/mcp.server");
          return await handleMcp(request);
        }
        if (machinePath(path)) return await machineResponse(request);
        const handler = await getServerEntry();
        const response = await handler.fetch(request, env, ctx);
        const normalized = await normalizeCatastrophicSsrResponse(response);
        if (ownerPath) {
          const { ownerResponse } = await import("./lib/owner/auth.server");
          return ownerResponse(normalized);
        }
        return normalized;
      } catch (error) {
        console.error(error);
        const failed = new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
        const path = new URL(request.url).pathname;
        if (path === "/owner" || path.startsWith("/owner/")) {
          const { ownerResponse } = await import("./lib/owner/auth.server");
          return ownerResponse(failed);
        }
        return failed;
      }
    });
  },
};
