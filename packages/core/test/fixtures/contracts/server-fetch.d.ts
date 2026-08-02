import type { ChatServer } from "./server";

export declare class ChatFetchHandlers {
  constructor(server: ChatServer);
  handle(request: Request): Promise<Response>;
}
