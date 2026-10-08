import { createFileRoute } from "@tanstack/react-router";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export const Route = createFileRoute("/swagger")({
  component: SwaggerPage,
});

function SwaggerPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="mx-auto max-w-6xl px-5 py-10 md:px-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[.2em] text-primary">BuildAWallet API</p>
            <h1 className="mt-2 font-display text-3xl font-black">Swagger / OpenAPI</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Interactive documentation for the machine API. The specification is loaded directly from{" "}
              <code className="mx-1 rounded bg-muted px-1.5 py-0.5">/openapi.json</code>.
            </p>
          </div>
          <a href="/openapi.json" target="_blank" rel="noreferrer"
            className="rounded-full border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-widest hover:border-primary hover:text-primary">
            Open OpenAPI JSON
          </a>
        </div>
        <div className="swagger-shell rounded-2xl border border-border bg-background p-3 md:p-6">
          <SwaggerUI url="/openapi.json" />
        </div>
      </section>
    </div>
  );
}
