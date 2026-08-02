import * as Stream from "effect/Stream";

declare const stream: ReadableStream<unknown>;

Stream.fromReadableStream({
  evaluate: () => stream,
  onError: (error) => error,
});
