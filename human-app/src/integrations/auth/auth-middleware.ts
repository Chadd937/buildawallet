import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const requireAccountAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { accountFromRequest } = await import("./account.server");
    const request = getRequest();
    if (!request?.headers) throw new Error("Unauthorized: No request headers are available");
    return next({ context: await accountFromRequest(request) });
  },
);
