import { ChatServer, ChatServerError, ChatServerLive } from "./server/use-cases/chat-server.ts";
import {
  AuthPort,
  ChatModel,
  ChatRepositories,
  ChatServerConfiguration,
} from "./server/ports/chat-server.ts";

export class ChatServerEffect {
  static readonly AuthPort = AuthPort;
  static readonly ChatModel = ChatModel;
  static readonly ChatRepositories = ChatRepositories;
  static readonly Configuration = ChatServerConfiguration;
  static readonly Error = ChatServerError;
  static readonly Server = ChatServer;
  static readonly Live = ChatServerLive;
}
