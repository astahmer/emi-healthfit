import { HttpApi } from "effect/unstable/httpapi";
import { ConversationsApi, MessagesApi, ThreadsApi } from "./conversations.ts";
import {
  AnalyticsApi,
  DataApi,
  MemoriesExtraApi,
  PrivacyApi,
  SuggestionsApi,
  WorkoutsApi,
} from "./data.ts";
import { MemoriesApi, NotesApi } from "./notes-and-memories.ts";

export * from "./common.ts";
export * from "./conversations.ts";
export * from "./data.ts";
export * from "./notes-and-memories.ts";

export class EmiApi extends HttpApi.make("emi-api")
  .add(NotesApi)
  .add(MemoriesApi)
  .add(ConversationsApi)
  .add(ThreadsApi)
  .add(MessagesApi)
  .add(SuggestionsApi)
  .add(MemoriesExtraApi)
  .add(AnalyticsApi)
  .add(DataApi)
  .add(PrivacyApi)
  .add(WorkoutsApi) {}
