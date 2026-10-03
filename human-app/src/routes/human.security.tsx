import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "@/components/setup-page";

export const Route = createFileRoute("/human/security")({
  head: () => ({
    meta: [
      { title: "Wallet Security | BuildAWallet" },
      { name: "description", content: "Review the protection built into the Android wallet." },
      { property: "og:title", content: "Wallet Security | BuildAWallet" },
      { property: "og:description", content: "On-device encryption, recovery, and transaction review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <SetupPage
      step={4}
      eyebrow="04 / Security"
      title="Protected on the phone."
      description="These protections are implemented in Android v1. Your recovery phrase and signing key never enter the website."
      field="security"
      multiple
      next="/human/studio"
      back="/human/chains"
      choices={[
        { name: "Android Keystore", detail: "AES-GCM encryption backed by the device keystore", icon: "AES" },
        { name: "Recovery phrase", detail: "BIP-39 backup and restore on-device", icon: "KEY" },
        { name: "Transaction review", detail: "Network, destination, amount and fee shown before signing", icon: "REV" },
        { name: "Local signing", detail: "Transactions are signed only on the Android device", icon: "SIG" },
      ]}
    />
  );
}
