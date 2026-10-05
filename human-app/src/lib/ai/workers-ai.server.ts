import { createUIMessageStream, createUIMessageStreamResponse, parseJsonEventStream, type UIMessage } from "ai";
import { z } from "zod";
import type { WorkersAi } from "@/lib/db/context.server";
import { SYSTEM_PROMPT } from "./responses.server";

const eventSchema = z.object({ response: z.string().optional(), error: z.unknown().optional() });

/** Translate Workers AI SSE into the existing chat's UI message stream. */
export async function createWorkersAiResponse(
  request: Request,
  binding: WorkersAi,
  model: string,
  originalMessages: UIMessage[],
  pageContext: string,
  onFinish: (messages: UIMessage[]) => Promise<void>,
) {
  request.signal.throwIfAborted();
  const providerStream = await binding.run(model, {
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nCurrent app context:\n${pageContext}` },
      ...originalMessages.filter((message) => message.role !== "system").map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n"),
      })),
    ],
    max_tokens: 650,
    stream: true,
  });
  const reader = parseJsonEventStream({ stream: providerStream, schema: eventSchema }).getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  request.signal.addEventListener("abort", cancel, { once: true });
  if (request.signal.aborted) cancel();
  const stream = createUIMessageStream({
    originalMessages,
    execute: async ({ writer }) => {
      const id = crypto.randomUUID();
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      let hasText = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (request.signal.aborted) {
            writer.setOutcome({ status: "aborted" });
            writer.write({ type: "abort" });
            return;
          }
          if (done) break;
          if (!value.success || value.value.error != null)
            throw new Error("Workers AI returned an invalid response");
          const text = value.value.response;
          if (text) {
            hasText = true;
            writer.write({ type: "text-delta", id, delta: text });
          }
        }
        if (!hasText) throw new Error("Workers AI returned an empty response");
        writer.write({ type: "text-end", id });
        writer.write({ type: "finish", finishReason: "stop" });
        writer.setOutcome({ status: "completed" });
      } finally {
        request.signal.removeEventListener("abort", cancel);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
    onEnd: async ({ messages, outcome, isCancelled }) => {
      if (isCancelled) cancel();
      if (outcome.status === "completed" && !isCancelled) await onFinish(messages);
    },
    onError: () => "The wallet guide could not answer right now.",
  });
  return createUIMessageStreamResponse({ stream, headers: { "cache-control": "no-store" } });
}
