import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";

export const createChatStreamResponse = ({
  stream,
  headers,
}: {
  stream: ReadableStream<UIMessageChunk>;
  headers: HeadersInit;
}): Response => {
  const response = createUIMessageStreamResponse({ stream });
  const mergedHeaders = new Headers(response.headers);
  for (const [name, value] of new Headers(headers)) mergedHeaders.set(name, value);
  return new Response(response.body, { status: response.status, headers: mergedHeaders });
};
