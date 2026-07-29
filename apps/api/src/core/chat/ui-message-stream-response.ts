import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";

export const createChatStreamResponse = ({
  stream,
  headers,
}: {
  stream: ReadableStream<UIMessageChunk>;
  headers: HeadersInit;
}): Response =>
  createUIMessageStreamResponse({
    stream,
    headers: {
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
