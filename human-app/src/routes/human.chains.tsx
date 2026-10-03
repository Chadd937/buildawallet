import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "@/components/setup-page";
import { chainOptions } from "@/lib/wallet-data";

export const Route = createFileRoute("/human/chains")({
  head: () => ({
    meta: [
      { title: "Choose Chains | BuildAWallet" },
      { name: "description", content: "Select the EVM mainnet networks for your Android wallet." },
      { property: "og:title", content: "Choose Chains | BuildAWallet" },
      { property: "og:description", content: "Build a self-custody wallet across supported EVM networks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <SetupPage
      step={3}
      eyebrow="03 / Networks"
      title="Choose your universe."
      description="These networks are live in the Android v1 wallet: Ethereum, Base, Arbitrum, Polygon, Optimism, Avalanche C-Chain, and BNB Chain."
      field="chains"
      multiple
      next="/human/security"
      back="/human/custody"
      choices={chainOptions.map(([name, icon, detail]) => ({ name, icon, detail }))}
    />
  );
}
