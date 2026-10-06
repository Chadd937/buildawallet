import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MCP_CLIENTS } from "@/lib/machine/catalog";
import { Badge, Code, PageHero, Panel, Section, Step } from "@/components/machine/ui";

const TITLE = "MCP server setup ,  BuildAWallet Machine";
const DESC =
  "Connect Claude, Cursor, OpenAI agents or any MCP client to BuildAWallet's wallet and multichain tools over streamable HTTP.";
export const Route = createFileRoute("/nonhuman/mcp")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Mcp,
});

type Tool = { name: string; description: string };

function Mcp() {
  const [client, setClient] = useState<string>(MCP_CLIENTS[0].id);
  const [origin, setOrigin] = useState("https://buildawallet.xyz");
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [toolError, setToolError] = useState(false);
  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })
      .then((r) => r.json() as Promise<{ result?: { tools: Tool[] } }>)
      .then((d) => setTools(d.result?.tools ?? []))
      .catch(() => setToolError(true));
  }, []);
  const url = `${origin}/mcp`;
  const selected = MCP_CLIENTS.find((c) => c.id === client) ?? MCP_CLIENTS[0];

  return (
    <>
      <PageHero
        eyebrow="Model Context Protocol"
        title={
          <>
            Plug in.
            <br />
            Tools appear.
          </>
        }
      >
        MCP is how AI assistants discover and call outside tools. Add BuildAWallet once and your
        agent can create wallets, read ten chains, prepare transfers and use prepaid API units
        through native tool calls. Endpoint: <code className="text-foreground">{url}</code>{" "}
        (streamable HTTP, JSON-RPC 2.0).
      </PageHero>

      <Section eyebrow="Setup" title="Pick your client">
        <div className="flex flex-wrap gap-2">
          {MCP_CLIENTS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setClient(c.id)}
              className={`rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest ${c.id === client ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="mt-5">
          <Code title={selected.file} code={selected.config(url)} />
        </div>
        <div className="mt-6">
          <Step n={1} title="Free tools work without a key">
            Wallet kit, server-made wallet, address validation, chains, plans and quotes need no
            credentials.
          </Step>
          <Step n={2} title="Add an API key for metered tools">
            Create a <code>baw_acct_</code> key in the dashboard and pass it as{" "}
            <code>Authorization: Bearer</code>. Each tool's unit cost is in its description.
          </Step>
          <Step n={3} title="Use your prepaid units">
            Buy or renew a plan with USDC on Base or Solana. Tool calls deduct account units without
            another blockchain payment.
          </Step>
        </div>
      </Section>

      <Section
        eyebrow="Live catalog"
        title={`Tools${tools ? ` (${tools.length})` : ""}`}
        intro="Loaded live from the server just now."
      >
        {toolError ? (
          <p className="text-sm text-destructive">Could not load the tool list.</p>
        ) : !tools ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {tools.map((t) => (
              <Panel key={t.name} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-sm text-primary">{t.name}</code>
                  {/Free/.test(t.description) ? (
                    <Badge tone="primary">free</Badge>
                  ) : /unit/.test(t.description) ? (
                    <Badge>metered</Badge>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t.description}</p>
              </Panel>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
