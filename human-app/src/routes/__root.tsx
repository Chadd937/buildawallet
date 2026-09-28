import { Outlet, Link, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="font-display text-6xl">404</h1>
        <p className="mt-3 text-muted-foreground">That HUMAN builder page does not exist.</p>
        <Link to="/human/setup" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-primary-foreground">Return to setup</Link>
      </div>
    </div>
  ),
  component: () => <Outlet />,
});
