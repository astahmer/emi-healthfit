import { HttpApi } from "effect/unstable/httpapi";
import { ConversationsApi, MessagesApi, ThreadsApi } from "./conversations";
import {
  AnalyticsApi,
  DataApi,
  MemoriesExtraApi,
  PrivacyApi,
  SuggestionsApi,
  WorkoutsApi,
} from "./data";
import { MemoriesApi, NotesApi } from "./notes-and-memories";

export * from "./common";
export * from "./conversations";
export * from "./data";
export * from "./notes-and-memories";

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
