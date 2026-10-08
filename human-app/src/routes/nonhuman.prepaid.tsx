import { createFileRoute, Link } from "@tanstack/react-router";
import { PLANS } from "@/lib/machine/config";
import { Code, PageHero, Section, Step } from "@/components/machine/ui";

const TITLE = "Prepaid API access : BuildAWallet";
const DESC = "Pay once in USDC, then use API units without a blockchain payment for every request.";
export const Route = createFileRoute("/nonhuman/prepaid")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }] }),
  component: Prepaid,
});

function Prepaid() {
  return (
    <>
      <PageHero
        eyebrow="Prepaid access"
        title={
          <>
            Pay once.
            <br />
            Use your units.
          </>
        }
      >
        Buy a block of API units on any supported payment network. EVM/Solana use USDC; Bitcoin uses BTC. Each metered request deducts units
        from your account, without another blockchain payment.
      </PageHero>
      <Section title="Three steps">
        <Step n={1} title="Choose a plan">
          {Object.values(PLANS)
            .map(
              (plan) =>
                `${plan.name}: ${plan.priceUSDC} USDC for ${plan.units.toLocaleString()} units`,
            )
            .join("; ")}
          . Plans last 30 days. Network fees apply to the purchase itself.
        </Step>
        <Step n={2} title="Get your API key">
          Use the account dashboard, or use a supported public wallet and confirm the exact quoted payment
          through the API. Keep your API key private.
        </Step>
        <Step n={3} title="Call the service">
          Attach your key as a bearer credential. Check remaining units at
          <code> /machine/v1/usage</code>. Discovery and wallet-kit tools stay free.
        </Step>
        <Link
          to="/nonhuman/dashboard"
          className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 font-display text-sm font-black uppercase text-primary-foreground"
        >
          Open account dashboard
        </Link>
      </Section>
      <Section title="Use your prepaid key">
        <Code
          title="balance read"
          code={`curl -H 'Authorization: Bearer YOUR_API_KEY' \\\n  https://buildawallet.xyz/machine/v1/base/wallet/YOUR_PUBLIC_ADDRESS`}
        />
        <p className="mt-4 text-sm text-muted-foreground">
          API units are service credits, not a cryptocurrency balance. When units run out, renew
          your plan before making more metered requests. Plans do not charge your wallet
          automatically.
        </p>
      </Section>
    </>
  );
}
