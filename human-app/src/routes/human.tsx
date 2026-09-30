import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/human")({
  component: HumanLayout,
});

function HumanLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const publicRoute = pathname === "/human" || pathname === "/human/setup";
  const [checking, setChecking] = useState(!publicRoute);

  useEffect(() => {
    if (publicRoute) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);

    fetch("/api/human/account", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) return { authenticated: false, verified: false };
        return response.json();
      })
      .then((account) => {
        if (cancelled) return;
        if (!account.authenticated || !account.verified) {
          void navigate({ to: "/human/setup", replace: true });
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) void navigate({ to: "/human/setup", replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, pathname, publicRoute]);

  if (!publicRoute && checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-foreground">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Checking BuildAWallet account…
        </p>
      </div>
    );
  }

  return <Outlet />;
}
