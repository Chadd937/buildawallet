import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";
import { readJsonBody } from "@/lib/body";
import { containsWalletSecret } from "@/lib/ai/secrets";
import { accountFromRequest } from "@/integrations/auth/auth-middleware";

const requestSchema = z.object({
  messages: z.array(z.unknown()).max(60),
  context: z.object({
    path: z.string().max(80),
    walletName: z.string().max(24),
    chains: z.array(z.string().max(30)).max(12),
    features: z.array(z.string().max(40)).max(40),
    currency: z.string().max(8),
  }),
});

const json = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function authenticatedAccount(request: Request) {
  try {
    return await accountFromRequest(request);
  } catch {
    return null;
  }
}

async function get(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return json(401, "Sign in to use the wallet guide.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("human_ai_conversations")
    .select("messages")
    .eq("user_id", account.userId)
    .maybeSingle();
  if (error) return json(503, "Conversation history is unavailable.");
  return Response.json(
    { messages: Array.isArray(data?.messages) ? data.messages : [] },
    {
      headers: { "cache-control": "no-store" },
    },
  );
}

async function remove(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return json(401, "Sign in to use the wallet guide.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("human_ai_conversations")
    .delete()
    .eq("user_id", account.userId);
  if (error) return json(503, "Conversation could not be cleared.");
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

async function post(request: Request) {
  const account = await authenticatedAccount(request);
  if (!account) return json(401, "Sign in to use the wallet guide.");
  if (Number(request.headers.get("content-length") ?? 0) > 220_000)
    return json(413, "This conversation is too large. Start a new conversation.");

  let body: unknown;
  try {
    body = await readJsonBody(request, 220_000);
  } catch (error) {
    return json(
      error instanceof RangeError && error.message.includes("too large") ? 413 : 400,
      "The chat request is not valid or is too large.",
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return json(400, "The chat request is not valid.");
  const validated = await safeValidateUIMessages({ messages: parsed.data.messages });
  if (!validated.success) return json(400, "The conversation contains an unsupported message.");

  for (const message of validated.data) {
    for (const part of message.parts) {
      if (part.type === "text" && containsWalletSecret(part.text))
        return json(
          400,
          "Do not submit a recovery phrase or private key. Keep wallet secrets on your device.",
        );
    }
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const messages = validated.data as UIMessage[];
  const pageContext = JSON.stringify(parsed.data.context);
  const modelMessages = await convertToModelMessages(messages);
  const apiKey = process.env["OPENAI_API_KEY"];
  const model = process.env["OPENAI_MODEL"];
  const baseURL = process.env["OPENAI_BASE_URL"];
  if (!apiKey || !model) return json(503, "The wallet guide is not configured yet.");

  const { createHumanAiResponse } = await import("@/lib/ai/responses.server");
  return createHumanAiResponse(
    request,
    { apiKey, model, ...(baseURL ? { baseURL } : {}) },
    modelMessages,
    messages,
    pageContext,
    async (completed) => {
      const clean = completed.slice(-60);
      const { error } = await supabaseAdmin.from("human_ai_conversations").upsert({
        user_id: account.userId,
        messages: JSON.parse(JSON.stringify(clean)),
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("Wallet guide history could not be saved", error.message);
    },
  );
}

export const Route = createFileRoute("/api/human-ai")({
  server: {
    handlers: {
      GET: ({ request }) => get(request),
      POST: ({ request }) => post(request),
      DELETE: ({ request }) => remove(request),
    },
  },
});
