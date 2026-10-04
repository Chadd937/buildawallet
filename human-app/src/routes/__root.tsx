import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { LegalEntryGate } from "@/components/legal-entry-gate";
import studioBackdrop from "@/assets/studio-hero.jpg";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0b0d10" },
      { title: "BuildAWallet ,  Build your own self-custody crypto wallet" },
      { name: "description", content: "Design, deploy and use your own multichain self-custody wallet on web and Android." },
      { name: "author", content: "BuildAWallet" },
      { property: "og:site_name", content: "BuildAWallet" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@500;700;900&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg?v=20261004", type: "image/svg+xml" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isLanding = useRouterState({ select: (state) => state.location.pathname === "/" });
  const isMachine = useRouterState({ select: (state) => state.location.pathname.startsWith("/nonhuman") });

  return (
    <QueryClientProvider client={queryClient}>
      {!isLanding ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <img
            src={studioBackdrop}
            alt=""
            className="h-full w-full object-cover object-center opacity-40 brightness-90 saturate-100"
          />
          <div className="absolute inset-0 bg-background/55" />
          <div className="absolute inset-0 studio-backdrop-glow" />
          {isMachine ? <div className="absolute inset-0 bg-background/35" /> : null}
        </div>
      ) : null}
      <div className="relative z-10">
        <Outlet />
      </div>
      <LegalEntryGate isLanding={isLanding} />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
