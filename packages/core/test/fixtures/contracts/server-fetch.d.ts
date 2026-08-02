import type { ChatServer } from "./server";

export type FetchHandler = (request: Request) => Promise<Response>;

export interface FetchHandlers {
  readonly handle: FetchHandler;
}

export declare const createFetchHandlers: (server: ChatServer) => FetchHandlers;
