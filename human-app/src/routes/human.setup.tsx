import { createFileRoute } from "@tanstack/react-router";
import { SetupPage } from "@/components/setup-page";
import { useWalletDraft } from "@/hooks/use-wallet-draft";

export const Route = createFileRoute("/human/setup")({
  head: () => ({
    meta: [
      { title: "Name Your Wallet | BuildAWallet" },
      {
        name: "description",
        content: "Start your Human wallet build with a name and visual identity.",
      },
      { property: "og:title", content: "Name Your Wallet | BuildAWallet" },
      { property: "og:description", content: "Start your personalized wallet build." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HumanIdentity,
});

const styles = [
  { name: "Acid Vault", detail: "Dark, secure, electric green", icon: "AV" },
  { name: "Pixel Pop", detail: "Playful arcade energy", icon: "PP" },
  { name: "Clean Signal", detail: "Quiet, focused, minimal", icon: "CS" },
];

function HumanIdentity() {
  const { draft, setDraft } = useWalletDraft();

  return (
    <SetupPage
      step={1}
      eyebrow="01 / Identity"
      title="Name your future wallet."
      description="Give your build a name and choose its visual DNA. You can remix every detail later."
      field="theme"
      choices={styles}
      next="/human/custody"
      back="/"
    >
      <label className="mb-5 block">
        <span className="mb-2 block font-mono text-[10px] uppercase text-muted-foreground">
          Wallet name
        </span>
        <input
          className="h-14 w-full rounded-xl border border-input bg-background px-4 text-lg text-foreground outline-none focus:border-primary"
          maxLength={32}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Nova Wallet"
        />
      </label>
    </SetupPage>
  );
}
