import { ChatServer } from "@emi/core/server";
import type { ChatServerOptions } from "@emi/core/server";

declare const options: ChatServerOptions;
const server = new ChatServer(options);
void server;
