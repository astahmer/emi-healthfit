import { Effect } from "effect";
import { ChatProtocol } from "@emi/core/protocol";
import type { Conversation, ProtocolDecodeError } from "@emi/core/protocol";

declare const input: unknown;

const decoded: Effect.Effect<Conversation, ProtocolDecodeError> =
  ChatProtocol.fromConversationDto(input);
const promise: Promise<Conversation> = ChatProtocol.runPromise(decoded);

void ChatProtocol.schemas.conversation;
void promise;
