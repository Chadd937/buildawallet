import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ENDPOINTS } from "@/lib/machine/catalog";
import { Badge, PageHero, Section } from "@/components/machine/ui";

const SwaggerExplorer = lazy(() => import("@/components/machine/swagger-explorer"));

const TITLE = "API explorer (Swagger) ,  BuildAWallet Machine";
const DESC = "Interactive OpenAPI 3.1 explorer for the BuildAWallet Machine API. Try wallet, chain, x402 and subscription endpoints live.";
export const Route = createFileRoute("/nonhuman/api")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: ApiPage,
});

const authTone = { none: "primary", "api-key": "muted", session: "pop", x402: "zap" } as const;

function ApiPage() {
  return (
    <>
      <PageHero eyebrow="OpenAPI 3.1 · Swagger" title={<>Every endpoint.<br />Try it live.</>}>
        The full spec lives at <a href="/openapi.json" className="text-primary underline">/openapi.json</a>. Free endpoints work right here; for metered ones click <b className="text-foreground">Authorize</b> and paste an API key from the dashboard.
      </PageHero>
      <Section eyebrow="At a glance" title="Endpoint index">
        <div className="overflow-x-auto rounded-2xl border border-border bg-card/70">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"><tr><th className="p-3">Method</th><th className="p-3">Path</th><th className="p-3">Auth</th><th className="p-3">Units</th><th className="p-3">What it does</th></tr></thead>
            <tbody>{ENDPOINTS.map((e) => <tr key={e.method + e.path} className="border-t border-border"><td className="p-3 font-mono text-xs text-primary">{e.method}</td><td className="p-3 font-mono text-xs">{e.path}</td><td className="p-3"><Badge tone={authTone[e.auth]}>{e.auth}</Badge></td><td className="p-3 font-mono text-xs">{e.auth === "x402" ? "$0.01" : e.units || "free"}</td><td className="p-3 text-xs text-muted-foreground">{e.summary}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>
      <Section eyebrow="Interactive" title="Swagger explorer">
        <div className="swagger-dark overflow-hidden rounded-2xl border border-border bg-card">
          <ClientOnly fallback={<p className="p-6 text-sm text-muted-foreground">Loading explorer…</p>}>
            <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading explorer…</p>}><SwaggerExplorer /></Suspense>
          </ClientOnly>
        </div>
      </Section>
    </>
  );
}
