import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepMeter, WalletShell } from "@/components/wallet-shell";
import { useWalletDraft } from "@/hooks/use-wallet-draft";
import type { WalletDraft } from "@/lib/wallet-data";

export type Choice = { name: string; detail: string; icon: string };

type SetupPageProps = {
  step: number;
  eyebrow: string;
  title: string;
  description: string;
  field: keyof WalletDraft;
  choices: Choice[];
  multiple?: boolean;
  next: "/human/custody" | "/human/chains" | "/human/security" | "/human/studio";
  back: "/" | "/human" | "/human/custody" | "/human/chains";
  children?: React.ReactNode;
};

export function SetupPage({
  step,
  eyebrow,
  title,
  description,
  field,
  choices,
  multiple,
  next,
  back,
  children,
}: SetupPageProps) {
  const { draft, setDraft, ready } = useWalletDraft();
  const navigate = useNavigate();
  const value = draft[field];
  const selected = (name: string) => (Array.isArray(value) ? value.includes(name) : value === name);
  const toggle = (name: string) =>
    setDraft((current) => {
      const currentValue = current[field];
      if (multiple) {
        const list = Array.isArray(currentValue) ? currentValue : [];
        return {
          ...current,
          [field]: list.includes(name) ? list.filter((item) => item !== name) : [...list, name],
        };
      }
      return { ...current, [field]: name };
    });
  const hasChoice = Array.isArray(value) ? value.length > 0 : Boolean(value);

  return (
    <WalletShell>
      <main className="setup-stage mx-auto grid min-h-[calc(100vh-89px)] max-w-7xl place-items-center overflow-hidden px-4 py-8 sm:px-6">
        <FloatingCoins />
        <section className="setup-panel w-full max-w-4xl rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-primary/5 sm:p-8">
          <StepMeter step={step} />
          <div className="mb-7 max-w-2xl">
            <p className="font-mono text-[10px] uppercase text-primary">{eyebrow}</p>
            <h1 className="mt-2 font-display text-3xl leading-tight sm:text-5xl">{title}</h1>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">{description}</p>
          </div>
          {children}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {choices.map((choice) => (
              <button
                key={choice.name}
                type="button"
                className="choice-card relative min-h-32 p-4 text-left"
                data-selected={selected(choice.name)}
                onClick={() => toggle(choice.name)}
                disabled={!ready}
              >
                <span className="mb-4 grid size-9 place-items-center rounded-lg bg-secondary font-display text-sm text-primary">
                  {choice.icon}
                </span>
                <strong className="block font-display text-sm">{choice.name}</strong>
                <span className="mt-1 block text-sm text-muted-foreground">{choice.detail}</span>
                {selected(choice.name) && (
                  <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-7 flex flex-col-reverse items-stretch justify-between gap-3 border-t border-border pt-5 sm:flex-row sm:items-center">
            <Button variant="vault" asChild>
              <Link to={back}>
                <ArrowLeft /> Back
              </Link>
            </Button>
            <div className="flex flex-col items-end gap-2">
              <Button
                variant="arcade"
                size="xl"
                disabled={!hasChoice}
                onClick={() => navigate({ to: next })}
              >
                {step === 4 ? "Enter Studio" : "Continue"}
                <ArrowRight />
              </Button>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <ShieldCheck className="size-3 text-primary" /> Never enter a seed phrase or private
                key
              </span>
            </div>
          </div>
        </section>
      </main>
    </WalletShell>
  );
}

function FloatingCoins() {
  return (
    <div className="setup-coins" aria-hidden="true">
      <span className="setup-coin setup-coin-btc">
        <b>₿</b>
      </span>
      <span className="setup-coin setup-coin-trx">
        <svg viewBox="0 0 32 32">
          <path d="M4.5 5.2 27.2 9l-10.1 18L4.5 5.2Zm0 0 13 8.2L27.2 9m-9.7 4.4-.4 13.6" />
        </svg>
      </span>
      <span className="setup-coin setup-coin-sol">
        <svg viewBox="0 0 34 28">
          <path d="m8 3 22 0-4 5H4l4-5Zm-4 9h22l4 4H8l-4-4Zm4 8h22l-4 5H4l4-5Z" />
        </svg>
      </span>
      <span className="setup-coin setup-coin-eth">
        <svg viewBox="0 0 32 32">
          <path d="M16 3 8.4 16.2 16 20.7l7.6-4.5L16 3Zm0 19.2-7.6-4.5L16 29l7.6-11.3-7.6 4.5Z" />
        </svg>
      </span>
      <span className="setup-coin setup-coin-bnb">
        <svg viewBox="0 0 32 32">
          <path d="m16 3 5 5-5 5-5-5 5-5ZM8 11l5 5-5 5-5-5 5-5Zm16 0 5 5-5 5-5-5 5-5Zm-8 8 5 5-5 5-5-5 5-5Zm0-7 4 4-4 4-4-4 4-4Z" />
        </svg>
      </span>
      <span className="setup-coin setup-coin-ltc">
        <b>Ł</b>
      </span>
    </div>
  );
}
