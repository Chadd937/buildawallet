import { readJsonBody } from "@/lib/body";
import { readTransaction } from "@/lib/machine/data.server";
import { isOwnerRequest, ownerResponse } from "./auth.server";

export async function handleOwnerRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!(await isOwnerRequest(request)))
    return ownerResponse(new Response("Not found", { status: 404 }));
  if (request.method === "GET" && url.pathname === "/owner") return null;
  if (request.method === "GET" && url.pathname === "/owner/")
    return ownerResponse(Response.redirect(new URL("/owner", url), 302));
  try {
    let response: Response;
    if (request.method === "GET" && url.pathname === "/owner/access")
      response = Response.json({ authorized: true });
    else if (request.method === "GET" && url.pathname === "/owner/treasury") {
      const { treasurySnapshot } = await import("./treasury.server");
      response = Response.json(await treasurySnapshot());
    } else if (request.method === "POST" && url.pathname === "/owner/withdrawal/prepare") {
      const { prepareOwnerWithdrawal } = await import("./withdrawal.server");
      response = Response.json(await prepareOwnerWithdrawal(await readJsonBody(request, 4096)));
    } else if (request.method === "GET" && url.pathname === "/owner/withdrawal/status") {
      const chain = url.searchParams.get("chain");
      if (chain !== "base" && chain !== "solana") throw new RangeError("Choose Base or Solana");
      response = Response.json(await readTransaction(chain, url.searchParams.get("tx") ?? ""));
    } else response = new Response("Not found", { status: 404 });
    return ownerResponse(response);
  } catch (error) {
    return ownerResponse(
      Response.json(
        {
          error:
            error instanceof RangeError
              ? error.message
              : "Treasury request unavailable. Refresh and try again.",
        },
        { status: error instanceof RangeError ? 400 : 503 },
      ),
    );
  }
}
