import type { FileUIPart } from "ai";

import { ChatUiMessages, type ChatUiMessage } from "../chat/ui-messages.ts";
import type { ChatMessage } from "../protocol/messages.ts";
import type { Attachment } from "../protocol/parts.ts";

export const toUiMessage = (message: ChatMessage): ChatUiMessage =>
  ChatUiMessages.fromProtocolMessage({
    id: message.id,
    role: message.role,
    parts: message.parts,
  });

export const toUiMessages = ({
  messages,
}: {
  messages: ReadonlyArray<ChatMessage>;
}): ChatUiMessage[] => messages.map(toUiMessage);

export const toAttachment = (file: FileUIPart): Attachment => ({
  id: `attachment:${file.url}`,
  name: file.filename ?? "Attachment",
  mediaType: file.mediaType,
  url: file.url,
});

export const toFilePart = (file: Attachment): FileUIPart => ({
  type: "file",
  filename: file.name,
  mediaType: file.mediaType,
  url: file.url,
});
