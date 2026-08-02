// @ts-ignore R0 target entrypoint is implemented in a later packet.
import { createFetchHandlers } from "@emi/core/server/fetch";
// @ts-ignore R0 target entrypoint is implemented in a later packet.
import type { ChatServer } from "@emi/core/server";

declare const server: ChatServer;
const handlers = createFetchHandlers(server);
const response = handlers.handle(new Request("/api/chat"));
void response;
