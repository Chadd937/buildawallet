import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, LoaderCircle, MessageCircle, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useDraft } from "@/hooks/use-draft";
import { containsWalletSecret } from "@/lib/ai/secrets";
import guide from "@/assets/wallet-guide.png";

const suggestions = [
  "Help me choose my chains",
  "Explain my safety limits",
  "How do I receive crypto safely?",
];

export function WalletGuide() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { draft } = useDraft();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    void fetch("/api/human-ai", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { messages: [] }))
      .then((data) => {
        if (!active) return;
        setInitialMessages(Array.isArray(data?.messages) ? (data.messages as UIMessage[]) : []);
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setInitialMessages([]);
          setLoaded(true);
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open]);

  function changeOpen(next: boolean) {
    if (next) setLoaded(false);
    setOpen(next);
  }

  return (
    <>
      {(!open || !loaded) && (
        <div
          className={`fixed right-4 z-40 flex items-center gap-3 sm:right-5 ${path === "/human/wallet" ? "bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-[calc(1.25rem+env(safe-area-inset-bottom))]" : "bottom-[calc(1.25rem+env(safe-area-inset-bottom))]"}`}
        >
          <button
            type="button"
            onClick={() => changeOpen(true)}
            disabled={open}
            className="relative max-w-[calc(100vw-7.5rem)] rounded-2xl rounded-br-md border border-primary/30 bg-background/95 px-3 py-2 text-left text-xs text-foreground shadow-lg backdrop-blur-md transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait"
            aria-label="Chat with Byte"
          >
            <span
              aria-hidden="true"
              className="absolute -right-1.5 top-1/2 size-2.5 -translate-y-1/2 rotate-45 border-r border-t border-primary/30 bg-background"
            />
            <span className="relative block font-semibold">
              {open ? "Opening Byte…" : "Hi, I’m Byte!"}
            </span>
            <span className="relative mt-0.5 block text-muted-foreground">
              Your wallet & API guide.
            </span>
          </button>
          <Button
            type="button"
            aria-label="Open Byte chat"
            title="Open Byte chat"
            onClick={() => changeOpen(true)}
            disabled={open}
            className="size-14 shrink-0 rounded-full p-0 shadow-neon"
          >
            {open ? (
              <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
            ) : (
              <img
                src={guide}
                alt="Byte"
                width={816}
                height={816}
                className="size-12 object-contain"
              />
            )}
          </Button>
        </div>
      )}
      {loaded && (
        <WalletGuideChat
          key={initialMessages.map((m) => m.id).join(":") || "new"}
          open={open}
          setOpen={changeOpen}
          initialMessages={initialMessages}
          context={{
            path,
            walletName: draft.name,
            chains: draft.chains,
            features: draft.features,
            currency: draft.currency,
          }}
        />
      )}
    </>
  );
}

function WalletGuideChat({
  open,
  setOpen,
  initialMessages,
  context,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialMessages: UIMessage[];
  context: {
    path: string;
    walletName: string;
    chains: string[];
    features: string[];
    currency: string;
  };
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/human-ai",
        credentials: "include",
        body: { context },
      }),
    [
      context.path,
      context.walletName,
      context.currency,
      context.chains.join(),
      context.features.join(),
    ],
  );
  const { messages, sendMessage, status, stop, error, setMessages } = useChat<UIMessage>({
    id: "buildawallet-guide",
    messages: initialMessages,
    transport,
    onError: (chatError) => toast.error(chatError.message || "The wallet guide could not answer."),
    onFinish: () => inputRef.current?.focus(),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  async function clearConversation() {
    const response = await fetch("/api/human-ai", { method: "DELETE", credentials: "include" });
    if (!response.ok) {
      toast.error("Conversation could not be cleared.");
      return;
    }
    setMessages([]);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            aria-describedby="byte-description"
            className="fixed inset-x-2 bottom-2 z-50 flex h-[min(620px,calc(100dvh-1rem))] flex-col overflow-hidden rounded-xl border border-primary/30 bg-background/95 shadow-neon backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(650px,calc(100dvh-2.5rem))] sm:w-[390px]"
          >
            <DialogHeader className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-3 py-2 text-left">
              <img
                src={guide}
                alt="Byte wallet guide"
                width={816}
                height={816}
                className="size-11 shrink-0 object-contain"
              />
              <div className="min-w-0">
                <DialogTitle className="truncate text-lg">Byte</DialogTitle>
                <DialogDescription
                  id="byte-description"
                  className="truncate text-xs text-foreground"
                >
                  Wallet & API guide · keep your keys private
                </DialogDescription>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Clear conversation"
                  title="Clear conversation"
                  onClick={clearConversation}
                >
                  <RotateCcw />
                </Button>
                <DialogPrimitive.Close asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Close Byte chat"
                    title="Close Byte chat"
                  >
                    <span aria-hidden="true">×</span>
                  </Button>
                </DialogPrimitive.Close>
              </div>
            </DialogHeader>
            <Conversation className="min-h-0">
              <ConversationContent className="gap-4 px-3 py-3">
                {messages.length === 0 && (
                  <div className="mx-auto flex max-w-sm flex-col items-center py-3 text-center">
                    <img
                      src={guide}
                      alt=""
                      width={816}
                      height={816}
                      className="size-20 object-contain"
                    />
                    <h3 className="mt-1 text-lg font-bold">What are we building?</h3>
                    <p className="mt-1 text-xs text-foreground">
                      Ask about chains, features, fees, receiving, or safe wallet setup.
                    </p>
                    <div className="mt-3 grid w-full gap-1.5">
                      {suggestions.map((text) => (
                        <Button
                          key={text}
                          variant="outline"
                          size="sm"
                          className="justify-start whitespace-normal text-left text-xs"
                          onClick={() => void sendMessage({ text })}
                        >
                          <MessageCircle />
                          {text}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageContent
                      className={
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground"
                      }
                    >
                      {message.parts.map((part, index) =>
                        part.type === "text" ? (
                          <MessageResponse key={`${message.id}-${index}`}>
                            {part.text}
                          </MessageResponse>
                        ) : null,
                      )}
                    </MessageContent>
                  </Message>
                ))}
                {status === "submitted" && (
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Bot className="size-4 text-primary" />
                    <Shimmer className="text-foreground">Byte is thinking…</Shimmer>
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error.message}
                  </p>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
            <div className="border-t border-border p-2.5">
              <PromptInput
                onSubmit={async ({ text }) => {
                  const prompt = text.trim();
                  if (!prompt || busy) return;
                  if (containsWalletSecret(prompt)) {
                    toast.error("Keep recovery phrases and private keys out of chat.");
                    return;
                  }
                  await sendMessage({ text: prompt });
                }}
              >
                <PromptInputTextarea
                  ref={inputRef}
                  placeholder="Ask Byte about your wallet…"
                  className="min-h-16 text-foreground placeholder:text-foreground/70"
                />
                <PromptInputFooter className="justify-between gap-2">
                  <span className="text-[11px] text-foreground">
                    Byte cannot see or sign with your keys.
                  </span>
                  <PromptInputSubmit status={status} onStop={stop} />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
    </>
  );
}
