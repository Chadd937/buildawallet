// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createWorkersAiResponse } from "@/lib/ai/workers-ai.server";
import type { UIMessage } from "ai";

const messages: UIMessage[] = [{ id: "user-1", role: "user", parts: [{ type: "text", text: "Explain Base network fees" }] }];
const model = "@cf/meta/llama-3.1-8b-instruct-fast";
const request = () => new Request("https://buildawallet.xyz/api/human-ai", { method: "POST" });
function providerStream(content: string) {
  const bytes = new TextEncoder().encode(content);
  // Deliberately split JSON, SSE delimiters and UTF-8 characters across chunks.
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } });
}

it("streams Workers AI tokens in the chat protocol and persists the completed conversation", async () => {
  const run = vi.fn().mockResolvedValue(providerStream(': keepalive\r\n\r\ndata: {"response":"Fees "}\r\n\r\ndata: {"response":"use ETH 💡"}\n\ndata: [DONE]\n\n'));
  const save = vi.fn();
  const response = await createWorkersAiResponse(request(), { run }, model, messages, '{"path":"/human/studio"}', save);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  const body = await response.text();
  expect(body).toContain('"type":"text-delta"');
  expect(body).toContain("Fees ");
  expect(body).toContain("use ETH 💡");
  expect(body).toContain('"type":"finish"');
  expect(run).toHaveBeenCalledWith(model, expect.objectContaining({ stream: true, max_tokens: 650 }));
  const input = run.mock.calls[0]![1];
  expect(input.messages[0].role).toBe("system");
  expect(input.messages[0].content).toContain("/human/studio");
  expect(input.messages[1]).toEqual({ role: "user", content: "Explain Base network fees" });
  expect(save).toHaveBeenCalledTimes(1);
  const completed = save.mock.calls[0]![0] as UIMessage[];
  expect(completed[0]).toEqual(messages[0]);
  expect(completed.at(-1)?.parts).toContainEqual(expect.objectContaining({ type: "text", text: "Fees use ETH 💡" }));
});

it.each(['data: {"error":"private provider details"}\n\n', 'data: not-json\n\n', 'data: [DONE]\n\n'])("masks provider errors and never saves a failed answer: %s", async (data) => {
  const save = vi.fn();
  const response = await createWorkersAiResponse(request(), { run: vi.fn().mockResolvedValue(providerStream(data)) }, model, messages, "{}", save);
  const body = await response.text();
  expect(body).toContain("The wallet guide could not answer right now.");
  expect(body).not.toContain("private provider details");
  expect(save).not.toHaveBeenCalled();
});

it("cancels the provider stream when the request is aborted and skips persistence", async () => {
  const abort = new AbortController();
  const cancelled = vi.fn();
  const source = new ReadableStream<Uint8Array>({ cancel: cancelled });
  const save = vi.fn();
  const response = await createWorkersAiResponse(new Request(request(), { signal: abort.signal }), { run: vi.fn().mockResolvedValue(source) }, model, messages, "{}", save);
  abort.abort();
  expect(await response.text()).toContain('"type":"abort"');
  expect(cancelled).toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
