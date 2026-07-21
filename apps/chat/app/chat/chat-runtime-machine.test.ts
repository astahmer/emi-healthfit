import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import type { FileUIPart, UIMessage } from "ai";
import { chatRuntimeMachine } from "./chat-runtime-machine";

const message = (id: string, role: "user" | "assistant", text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

describe("chatRuntimeMachine", () => {
  it("streams one assistant message without duplicating snapshots", () => {
    const actor = createActor(chatRuntimeMachine, { input: { messages: [] } });
    actor.start();
    actor.send({
      type: "submit.started",
      sessionId: "one",
      message: message("user", "user", "Hi"),
    });
    actor.send({ type: "stream.updated", message: message("assistant", "assistant", "Hel") });
    actor.send({ type: "stream.updated", message: message("assistant", "assistant", "Hello") });

    expect(actor.getSnapshot().matches("streaming")).toBe(true);
    expect(actor.getSnapshot().context.messages).toEqual([
      message("user", "user", "Hi"),
      message("assistant", "assistant", "Hello"),
    ]);

    actor.send({ type: "stream.completed" });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
  });

  it("switches sessions atomically while streaming", () => {
    const actor = createActor(chatRuntimeMachine, {
      input: { sessionId: "one", messages: [message("old", "user", "Old")] },
    });
    actor.start();
    actor.send({ type: "resume.started" });
    actor.send({
      type: "history.changed",
      sessionId: "two",
      messages: [message("new", "assistant", "New")],
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("idle")).toBe(true);
    expect(snapshot.context.sessionId).toBe("two");
    expect(snapshot.context.messages).toEqual([message("new", "assistant", "New")]);
  });

  it("keeps an independent composer draft for every session", () => {
    const file: FileUIPart = {
      type: "file",
      mediaType: "text/plain",
      filename: "notes.txt",
      url: "data:text/plain;base64,bm90ZXM=",
    };
    const actor = createActor(chatRuntimeMachine, { input: { sessionId: "one" } });
    actor.start();
    actor.send({ type: "draft.changed", value: "draft one" });
    actor.send({ type: "files.changed", files: [file] });
    actor.send({ type: "history.changed", sessionId: "two", messages: [] });
    actor.send({ type: "draft.changed", value: "draft two" });
    actor.send({ type: "history.changed", sessionId: "one", messages: [] });

    expect(actor.getSnapshot().context.draft).toBe("draft one");
    expect(actor.getSnapshot().context.files).toEqual([file]);
    actor.send({ type: "history.changed", sessionId: "two", messages: [] });
    expect(actor.getSnapshot().context.draft).toBe("draft two");
    expect(actor.getSnapshot().context.files).toEqual([]);
  });

  it("cannot remain streaming after a failure or stop", () => {
    const actor = createActor(chatRuntimeMachine, { input: {} });
    actor.start();
    actor.send({ type: "resume.started" });
    actor.send({ type: "stream.failed", error: new Error("network") });
    expect(actor.getSnapshot().matches("error")).toBe(true);

    actor.send({ type: "resume.started" });
    actor.send({ type: "stream.stopped" });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().matches("streaming")).toBe(false);
  });

  it("attaches a reconnect failure to a user turn that arrives with persisted history", () => {
    const actor = createActor(chatRuntimeMachine, { input: { sessionId: "one" } });
    actor.start();
    actor.send({ type: "resume.started" });
    actor.send({ type: "stream.failed", error: new Error("Generation timed out") });
    actor.send({
      type: "history.changed",
      sessionId: "one",
      messages: [message("orphaned-user", "user", "Unanswered request")],
    });

    expect(actor.getSnapshot().context.errorMessageId).toBe("orphaned-user");
    expect(actor.getSnapshot().context.error?.message).toBe("Generation timed out");
  });

  it("keeps composer draft updates while a generation is streaming", () => {
    const actor = createActor(chatRuntimeMachine, { input: { sessionId: "one" } });
    actor.start();
    actor.send({
      type: "submit.started",
      sessionId: "one",
      message: message("first", "user", "First"),
    });
    actor.send({ type: "draft.changed", value: "typed while streaming" });

    expect(actor.getSnapshot().matches("streaming")).toBe(true);
    expect(actor.getSnapshot().context.draft).toBe("typed while streaming");
  });

  it("replaces an in-flight generation when a new message is submitted", () => {
    const actor = createActor(chatRuntimeMachine, { input: { sessionId: "one" } });
    actor.start();
    actor.send({
      type: "submit.started",
      sessionId: "one",
      message: message("first", "user", "First"),
    });
    actor.send({ type: "stream.updated", message: message("partial", "assistant", "Hel") });
    actor.send({
      type: "submit.started",
      sessionId: "one",
      message: message("second", "user", "Second"),
    });

    expect(actor.getSnapshot().matches("streaming")).toBe(true);
    expect(actor.getSnapshot().context.messages).toEqual([
      message("first", "user", "First"),
      message("second", "user", "Second"),
    ]);
    expect(actor.getSnapshot().context.draft).toBe("");
  });

  it("keeps a completed assistant answer when a follow-up is submitted", () => {
    const actor = createActor(chatRuntimeMachine, {
      input: {
        sessionId: "one",
        messages: [
          message("first-user", "user", "What should I eat?"),
          message("first-assistant", "assistant", "Try more protein."),
        ],
      },
    });
    actor.start();
    expect(actor.getSnapshot().matches("idle")).toBe(true);

    actor.send({
      type: "submit.started",
      sessionId: "one",
      message: message("follow-up-user", "user", "Tell me about recovery"),
    });

    expect(actor.getSnapshot().matches("streaming")).toBe(true);
    expect(actor.getSnapshot().context.messages).toEqual([
      message("first-user", "user", "What should I eat?"),
      message("first-assistant", "assistant", "Try more protein."),
      message("follow-up-user", "user", "Tell me about recovery"),
    ]);
  });

  it("drops a failed partial assistant when submitting from error", () => {
    const actor = createActor(chatRuntimeMachine, { input: { sessionId: "one" } });
    actor.start();
    actor.send({
      type: "submit.started",
      sessionId: "one",
      message: message("first-user", "user", "First"),
    });
    actor.send({ type: "stream.updated", message: message("partial", "assistant", "Hel") });
    actor.send({ type: "stream.failed", error: new Error("network") });
    expect(actor.getSnapshot().matches("error")).toBe(true);

    actor.send({
      type: "submit.started",
      sessionId: "one",
      message: message("second-user", "user", "Second"),
    });

    expect(actor.getSnapshot().matches("streaming")).toBe(true);
    expect(actor.getSnapshot().context.messages).toEqual([
      message("first-user", "user", "First"),
      message("second-user", "user", "Second"),
    ]);
  });

  it("keeps simultaneous browser tabs isolated", () => {
    const firstTab = createActor(chatRuntimeMachine, { input: { sessionId: "one" } });
    const secondTab = createActor(chatRuntimeMachine, { input: { sessionId: "two" } });
    firstTab.start();
    secondTab.start();
    firstTab.send({
      type: "submit.started",
      sessionId: "one",
      message: message("first-user", "user", "First"),
    });
    secondTab.send({
      type: "submit.started",
      sessionId: "two",
      message: message("second-user", "user", "Second"),
    });
    firstTab.send({
      type: "stream.updated",
      message: message("first-assistant", "assistant", "One"),
    });
    secondTab.send({
      type: "stream.updated",
      message: message("second-assistant", "assistant", "Two"),
    });

    expect(firstTab.getSnapshot().context.messages.at(-1)?.id).toBe("first-assistant");
    expect(secondTab.getSnapshot().context.messages.at(-1)?.id).toBe("second-assistant");
  });

  it("replaces an edited turn and removes its stale response", () => {
    const actor = createActor(chatRuntimeMachine, {
      input: {
        sessionId: "one",
        messages: [
          message("first-user", "user", "Original"),
          message("first-assistant", "assistant", "Old answer"),
        ],
      },
    });
    actor.start();
    actor.send({
      type: "revision.started",
      sessionId: "one",
      replaceMessageId: "first-user",
      message: message("first-user", "user", "Edited"),
    });

    expect(actor.getSnapshot().context.messages).toEqual([message("first-user", "user", "Edited")]);
    expect(actor.getSnapshot().matches("streaming")).toBe(true);
  });
});
