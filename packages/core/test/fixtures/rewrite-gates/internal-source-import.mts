// @ts-expect-error Internal source paths are never part of the public contract.
import { genericChatAppMachine } from "@emi/core/src/web/chat-runtime/generic-chat-app-machine";

void genericChatAppMachine;
