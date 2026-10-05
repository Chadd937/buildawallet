import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("resolves email confirmation returns to both account destinations", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const setupReturn = new URL("https://buildawallet.xyz/human/setup?auth=confirmed");
    const dashboardReturn = new URL("https://buildawallet.xyz/nonhuman/dashboard?auth=confirmed");
    expect(router.matchRoutes(setupReturn.pathname).at(-1)?.routeId).toBe("/human/setup");
    expect(router.matchRoutes(dashboardReturn.pathname).at(-1)?.routeId).toBe(
      "/nonhuman/dashboard",
    );
  });
});
