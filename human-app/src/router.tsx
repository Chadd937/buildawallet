import { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { Route as RootRoute } from "./routes/__root";
import { Route as SetupFileRoute } from "./routes/human.setup";
import { Route as CustodyFileRoute } from "./routes/human.custody";
import { Route as ChainsFileRoute } from "./routes/human.chains";
import { Route as SecurityFileRoute } from "./routes/human.security";
import { Route as StudioFileRoute } from "./routes/human.studio";
import { Route as ReleaseFileRoute } from "./routes/human.release";
import { Route as PayFileRoute } from "./routes/human.pay";
import { Route as DownloadFileRoute } from "./routes/human.download";

const componentOf = (route: any) => route.options.component;

const humanRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "human",
  component: () => <Outlet />,
});

const humanIndexRoute = createRoute({
  getParentRoute: () => humanRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/human/setup", replace: true });
  },
});

const setupRoute = createRoute({
  getParentRoute: () => humanRoute,
  path: "setup",
  component: componentOf(SetupFileRoute),
});

const custodyRoute = createRoute({
  getParentRoute: () => humanRoute,
  path: "custody",
  component: componentOf(CustodyFileRoute),
});

const chainsRoute = createRoute({
  getParentRoute: () => humanRoute,
  path: "chains",
  component: componentOf(ChainsFileRoute),
});

const securityRoute = createRoute({
  getParentRoute: () => humanRoute,
  path: "security",
  component: componentOf(SecurityFileRoute),
});

const studioRoute = createRoute({
  getParentRoute: () => humanRoute,
  path: "studio",
  component: componentOf(StudioFileRoute),
});

const releaseRoute = createRoute({
  getParentRoute: () => humanRoute,
  path: "release",
  component: componentOf(ReleaseFileRoute),
});

const payRoute = createRoute({
  getParentRoute: () => humanRoute,
  path: "pay",
  component: componentOf(PayFileRoute),
});

const downloadRoute = createRoute({
  getParentRoute: () => humanRoute,
  path: "download",
  component: componentOf(DownloadFileRoute),
});

const routeTree = RootRoute.addChildren([
  humanRoute.addChildren([
    humanIndexRoute,
    setupRoute,
    custodyRoute,
    chainsRoute,
    securityRoute,
    studioRoute,
    releaseRoute,
    payRoute,
    downloadRoute,
  ]),
]);

export const getRouter = () => {
  const queryClient = new QueryClient();

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
