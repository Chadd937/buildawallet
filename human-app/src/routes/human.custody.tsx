import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "@/components/setup-page";

export const Route = createFileRoute("/human/custody")({
  head: () => ({
    meta: [
      { title: "Choose Custody | BuildAWallet" },
      { name: "description", content: "Choose how your browser-based self-custody wallet keys are controlled." },
      { property: "og:title", content: "Choose Custody | BuildAWallet" },
      { property: "og:description", content: "Build a self-custody desktop Web3 wallet whose keys stay on your device." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <SetupPage
      step={2}
      eyebrow="02 / Custody"
      title="You hold the keys."
      description="The browser wallet is self-custody only: the recovery phrase is created or restored locally and never sent to BuildAWallet."
      field="custody"
      next="/human/chains"
      back="/human"
      choices={[{
        name: "Self custody",
        detail: "BIP-39 recovery phrase + password-encrypted browser vault + local signing",
        icon: "YOU",
      }]}
    />
  );
}
