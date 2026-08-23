import { describe, expect, it } from "vitest";
import {
  toAttachment,
  toFilePart,
  toUiMessage,
  toUiMessages,
} from "../../src/web/chat-ui-mappers.ts";
import type { ChatMessage } from "../../src/protocol/messages.ts";

describe("chat ui mappers", () => {
  it("maps protocol messages to ui messages and back", () => {
    const message: ChatMessage = {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
      createdAt: "2026-07-14T10:00:00.000Z",
    };

    const uiMessage = toUiMessage(message);
    expect(uiMessage).toMatchObject({ id: "message-1", role: "user" });
    expect(uiMessage.parts).toEqual([{ type: "text", text: "hello" }]);
    expect(toUiMessages({ messages: [message] })).toHaveLength(1);
  });

  it("round-trips attachments through file parts with stable ids", () => {
    const filePart = {
      type: "file" as const,
      filename: "report.pdf",
      mediaType: "application/pdf",
      url: "https://example.com/report.pdf",
    };

    const attachment = toAttachment(filePart);
    expect(attachment).toMatchObject({
      id: `attachment:${filePart.url}`,
      name: "report.pdf",
      mediaType: "application/pdf",
      url: filePart.url,
    });

    expect(toFilePart(attachment)).toEqual(filePart);
  });

  it("defaults missing file names when mapping to attachments", () => {
    const attachment = toAttachment({
      type: "file",
      mediaType: "text/plain",
      url: "https://example.com/notes.txt",
    });
    expect(attachment.name).toBe("Attachment");
  });
});
