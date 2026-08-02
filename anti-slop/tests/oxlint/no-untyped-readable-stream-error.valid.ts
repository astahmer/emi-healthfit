import * as Stream from "effect/Stream";

declare const stream: ReadableStream<unknown>;

class StreamError extends Error {}

Stream.fromReadableStream({
  evaluate: () => stream,
  onError: (cause) => new StreamError(String(cause)),
});
