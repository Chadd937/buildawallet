import { createFileRoute, Link } from "@tanstack/react-router";
import { BASE_COLLECTOR, SOLANA_COLLECTOR } from "@/lib/machine/config";
import { Code, PageHero, Panel, Section, Step } from "@/components/machine/ui";

const TITLE = "Pay per call with x402 ,  BuildAWallet Machine";
const DESC = "How AI agents pay $0.01 USDC per request on Base or Solana using the open x402 HTTP payment standard. No account, no API key.";
export const Route = createFileRoute("/nonhuman/pay-per-call")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: PayPerCall,
});

function PayPerCall() {
  return (
    <>
      <PageHero eyebrow="x402 · pay per call" title={<>Pay a cent.<br />Get the data.</>}>
        x402 brings back HTTP status 402 "Payment Required". Your agent asks for data, the server replies with a price, the agent signs a USDC authorization and asks again. No sign-up, no API key, no human. Each read costs <b className="text-foreground">$0.01 USDC</b>, paid on Base or Solana.
      </PageHero>

      <Section eyebrow="The flow" title="Four moves">
        <Step n={1} title="Ask without paying">
          <Code title="request" code={`curl -i "https://buildawallet.xyz/machine/x402/wallet?chain=ethereum&address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"`} />
          <p>The response is <code>402</code> with a <code>PAYMENT-REQUIRED</code> header (base64 JSON). It lists accepted networks, the USDC asset, the amount and where to pay.</p>
        </Step>
        <Step n={2} title="Read the price">
          <Code title="decoded PAYMENT-REQUIRED (abridged)" code={`{
  "x402Version": 2,
  "accepts": [
    { "scheme": "exact", "network": "eip155:8453", "amount": "10000",
      "asset": "USDC", "payTo": "${BASE_COLLECTOR}" },
    { "scheme": "exact", "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "amount": "10000",
      "asset": "USDC", "payTo": "${SOLANA_COLLECTOR}" }
  ]
}`} />
          <p><code>10000</code> is 0.01 USDC (6 decimals). The challenge expires after five minutes.</p>
        </Step>
        <Step n={3} title="Sign locally and retry">
          <p>Your agent signs the payment with its own wallet ,  keys never leave it ,  and sends the same request with a <code>PAYMENT-SIGNATURE</code> header. Official x402 client libraries do this for you:</p>
          <Code title="agent.ts (Node / Bun)" code={`import { wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.AGENT_KEY);
const pay = wrapFetchWithPayment(fetch, (client) =>
  registerExactEvmScheme(client, { signer: account }));

const res = await pay("https://buildawallet.xyz/machine/x402/wallet?chain=solana&address=<addr>");
console.log(await res.json());`} />
          <p>Need a wallet first? <Link to="/nonhuman/wallets" className="text-primary underline">Get one here</Link>, then fund its Base or Solana address with a little USDC.</p>
        </Step>
        <Step n={4} title="Read the receipt">
          <p>A successful response is <code>200</code> with the chain data and a <code>PAYMENT-RESPONSE</code> header holding the settlement transaction. Keep it as proof of payment.</p>
        </Step>
      </Section>

      <Section eyebrow="Through MCP" title="Same thing, as a tool call">
        <Code title="tools/call" code={`{ "jsonrpc": "2.0", "id": 7, "method": "tools/call",
  "params": { "name": "wallet_payg",
    "arguments": { "chain": "base", "address": "0x…",
      "_meta": { "x402/payment": "<base64 payment payload>" } } } }`} />
        <p className="mt-3 text-sm text-muted-foreground">Without a payment, the tool returns the challenge in <code>_meta["x402/error"]</code> so the agent can sign and call again.</p>
      </Section>

      <Section eyebrow="When to use what" title="x402 or a subscription?">
        <div className="grid gap-4 md:grid-cols-2">
          <Panel><h3 className="font-display text-base font-black uppercase">x402</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Best for occasional or one-off reads and for fully autonomous agents. Each call settles on-chain. Currently covers native balances on all ten networks.</p></Panel>
          <Panel><h3 className="font-display text-base font-black uppercase">Subscription</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Best for volume. Units cost far less than a cent each and unlock stablecoins, transactions, snapshots and transfers. <Link to="/nonhuman/pricing" className="text-primary underline">See pricing</Link>.</p></Panel>
        </div>
      </Section>
    </>
  );
}
