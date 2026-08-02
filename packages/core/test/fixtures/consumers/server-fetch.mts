import { ChatFetchHandlers } from "@emi/core/server/fetch";
import type { ChatServer } from "@emi/core/server";

declare const server: ChatServer;
const handlers = new ChatFetchHandlers(server);
const response = handlers.handle(new Request("https://example.test/api/chat"));
void response;
