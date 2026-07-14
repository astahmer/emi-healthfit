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

  it("rejects a concurrent submission while one generation is streaming", () => {
    const actor = createActor(chatRuntimeMachine, { input: { sessionId: "one" } });
    actor.start();
    actor.send({
      type: "submit.started",
      sessionId: "one",
      message: message("first", "user", "First"),
    });
    actor.send({
      type: "submit.started",
      sessionId: "one",
      message: message("second", "user", "Second"),
    });

    expect(actor.getSnapshot().context.messages).toEqual([message("first", "user", "First")]);
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
});
