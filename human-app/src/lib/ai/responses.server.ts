import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage, type UIMessage } from "ai";

export const SYSTEM_PROMPT = `You are Byte, BuildAWallet's built-in wallet guide. Help people design and safely use their self-custody multichain wallet across Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Solana, Bitcoin, and Tron.

Be concise, practical, and friendly. Explain one clear next step at a time. You may explain Studio choices, wallet setup, balances, fees, receiving, and safe transaction review. Never request, accept, repeat, infer, or store a recovery phrase, private key, password, or secret. If a user shares one, warn them it may be compromised and tell them to move funds to a new wallet. Never claim a transaction is guaranteed, never encourage bypassing safety checks, and never initiate or sign transactions. Remind users that transfers are irreversible when relevant. Use the supplied page and wallet-build context, which intentionally contains no private keys.`;

export function createHumanAiResponse(
  request: Request,
  config: { apiKey: string; model: string; baseURL?: string },
  messages: ModelMessage[],
  originalMessages: UIMessage[],
  pageContext: string,
  onFinish: (messages: UIMessage[]) => Promise<void>,
) {
  const provider = createOpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  });
  const result = streamText({
    model: provider.responses(config.model),
    system: `${SYSTEM_PROMPT}\n\nCurrent app context:\n${pageContext}`,
    messages,
    abortSignal: request.signal,
    providerOptions: { openai: { store: false } },
  });
  const response = result.toUIMessageStreamResponse({
    originalMessages,
    sendReasoning: true,
    onFinish: async ({ messages: completed }) => onFinish(completed),
    onError: () => "The wallet guide could not answer right now.",
  });
  return response;
}
