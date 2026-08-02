// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { protocolSchemas } from "@emi/core/protocol";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import type { ChatMessage, GenerationEvent, MessagePart } from "@emi/core/protocol";

const part: MessagePart = { type: "text", text: "hello" };
const message: ChatMessage = {
  id: "message-1",
  role: "user",
  parts: [part],
  createdAt: "2026-08-02T00:00:00.000Z",
};
const event: GenerationEvent = { type: "completed", message };

void protocolSchemas;
void event;
