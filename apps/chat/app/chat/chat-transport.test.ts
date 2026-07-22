import { describe, expect, it } from "vitest";
import { consumeAssistantStream } from "./chat-transport";

describe("consumeAssistantStream", () => {
  it("fails an unfinished response after its inactivity limit", async () => {
    const cancelRef = { current: null as (() => void) | null };
    const stalledStream = new ReadableStream({
      start: () => {},
    });
    const result = consumeAssistantStream({
      stream: stalledStream,
      onMessage: () => {},
      cancelRef,
      inactivityTimeoutMilliseconds: 5,
    });
    const error = await Promise.race([
      result
        .then(() => new Error("Expected stalled response to fail."))
        .catch((cause: unknown) => cause),
      new Promise<Error>((resolve) =>
        setTimeout(() => {
          cancelRef.current?.();
          resolve(new Error("Test cleanup cancelled stalled response."));
        }, 50),
      ),
    ]);

    expect(error).toMatchObject({
      message: "Chat response stalled before completion.",
    });
  });
});
