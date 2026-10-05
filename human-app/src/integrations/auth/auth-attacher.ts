import { createMiddleware } from "@tanstack/react-start";
import { getSession } from "./client";

export const attachAccountAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const session = await getSession();
  return next({
    headers: session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {},
  });
});
