import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "@/components/setup-page";

export const Route = createFileRoute("/human/security")({
  head: () => ({
    meta: [
      { title: "Wallet Security | BuildAWallet" },
      { name: "description", content: "Review the local protections used by your browser-based self-custody wallet." },
      { property: "og:title", content: "Wallet Security | BuildAWallet" },
      { property: "og:description", content: "Password-encrypted local vault, recovery backup, explicit transaction review, and local signing." },
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
      title="Protected on this device."
      description="Your browser wallet encrypts recovery material locally. BuildAWallet never receives the recovery phrase, private key, or wallet password."
      field="security"
      multiple
      next="/human/studio"
      back="/human/chains"
      choices={[
        { name: "Browser vault", detail: "AES-GCM encrypted recovery material stored in browser IndexedDB", icon: "AES" },
        { name: "Recovery phrase", detail: "BIP-39 backup and restore performed locally", icon: "KEY" },
        { name: "Transaction review", detail: "Network, destination, amount and estimated fee shown before signing", icon: "REV" },
        { name: "Local signing", detail: "Transactions are signed in the browser after local unlock", icon: "SIG" },
      ]}
    />
  );
}
