import { withWorkerEnvironment, type WorkerEnvironment } from "./lib/db/context.server";
import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

const machinePath = (path: string) => path === "/machine" || path.startsWith("/machine/");

async function machineResponse(request: Request) {
  const { handleMachineRequest } = await import("./lib/machine/router.server");
  return handleMachineRequest(request);
}

async function discoveryResponse(path: string) {
  const { llms, offer, openapi } = await import("./lib/machine/spec");
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
        if (path === "/mcp") {
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
