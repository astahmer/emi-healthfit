// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { createChatServer } from "@emi/core/server";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import type { ChatServerOptions } from "@emi/core/server";

declare const options: ChatServerOptions;
const server = createChatServer(options);
void server;
