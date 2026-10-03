import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "@/components/setup-page";

export const Route = createFileRoute("/human/custody")({
  head: () => ({
    meta: [
      { title: "Choose Custody | BuildAWallet" },
      { name: "description", content: "Choose how your Android wallet keys are controlled." },
      { property: "og:title", content: "Choose Custody | BuildAWallet" },
      { property: "og:description", content: "Build a self-custody Android wallet." },
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
      description="Android v1 is self-custody only: the recovery phrase is generated or restored on your phone and never sent to BuildAWallet."
      field="custody"
      next="/human/chains"
      back="/human"
      choices={[{
        name: "Self custody",
        detail: "BIP-39 recovery phrase + Android Keystore encrypted local storage",
        icon: "YOU",
      }]}
    />
  );
}
