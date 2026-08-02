import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatProvider } from "@emi/core/react";
import { createChatRuntime } from "@emi/core";
import {
  Composer,
  ConnectedComposer,
  ConnectedThread,
  Message,
  MessagePart,
  ThreadViewport,
} from "@emi/core/components";
import { ChatApp } from "@emi/core/components/styled";

const message = {
  id: "message-1",
  role: "assistant" as const,
  parts: [
    { type: "text" as const, text: "Hello" },
    {
      type: "file" as const,
      file: { id: "file-1", name: "bad", mediaType: "image/png", url: "javascript:alert(1)" },
    },
  ],
  createdAt: "2026-08-02T00:00:00.000Z",
};

const createRuntime = () =>
  createChatRuntime({
    transport: {
      baseUrl: "https://chat.example/api",
      fetch: async () =>
        new Response(JSON.stringify({ conversations: [] }), {
          headers: { "content-type": "application/json" },
        }),
    },
    storage: {
      settings: { get: () => null, set: () => undefined, remove: () => undefined },
      drafts: { get: () => null, set: () => undefined, remove: () => undefined },
    },
    browser: { online: true, subscribeOnline: () => () => undefined },
    identity: { createId: () => "id-1", now: () => "2026-08-02T00:00:00.000Z" },
  });

describe("R5 component tiers", () => {
  it("keeps controlled primitives view-only and blocks unsafe attachment sinks", () => {
    const changes: string[] = [];
    const submits: string[] = [];
    render(
      <ThreadViewport messages={[message]}>
        <Message message={message} />
        <MessagePart part={message.parts[1]} />
        <Composer
          value="draft"
          onChange={(value) => changes.push(value)}
          onSubmit={() => submits.push("submitted")}
        />
      </ThreadViewport>,
    );

    expect(screen.getByRole("log")).toHaveTextContent("Hello");
    expect(screen.getAllByText("[attachment blocked]")).not.toHaveLength(0);
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "changed" },
    });
    fireEvent.submit(screen.getByRole("textbox", { name: "Message" }).closest("form")!);
    expect(changes).toEqual(["changed"]);
    expect(submits).toEqual(["submitted"]);
  });

  it("provides connected tiers from actor-owned runtime state", () => {
    const runtime = createRuntime();
    render(
      <ChatProvider runtime={runtime}>
        <ConnectedThread />
        <ConnectedComposer />
      </ChatProvider>,
    );

    expect(screen.getByTestId("chat-thread")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    runtime.dispose();
  });

  it("renders the styled recipe without importing AI SDK or owning runtime state", () => {
    const runtime = createRuntime();
    render(
      <ChatProvider runtime={runtime}>
        <ChatApp />
      </ChatProvider>,
    );

    expect(screen.getByRole("main", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Core Chat" })).toBeInTheDocument();
    expect(screen.getByText("Search conversations")).toBeInTheDocument();
    expect(screen.getByText("Memories")).toBeInTheDocument();
    expect(screen.getByLabelText("Theme")).toBeInTheDocument();
    expect(screen.getByLabelText("Add attachments")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
    runtime.dispose();
  });
});
