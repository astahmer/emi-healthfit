export * from "./common.ts";
export * from "./conversations.ts";
export * from "./data.ts";
export * from "./discord.ts";
export * from "./notes-and-memories.ts";

import { HttpApi } from "effect/unstable/httpapi";
import { ConversationsApi, MessagesApi, ThreadsApi } from "./conversations.ts";
import {
  AnalyticsApi,
  DataApi,
  HevyIntegrationApi,
  MemoriesExtraApi,
  PrivacyApi,
  SuggestionsApi,
  WorkoutsApi,
} from "./data.ts";
import { DiscordApi } from "./discord.ts";
import { MemoriesApi, NotesApi } from "./notes-and-memories.ts";

const CoreApiBase = HttpApi.make("emi-core-api")
  .add(NotesApi)
  .add(MemoriesApi)
  .add(ConversationsApi)
  .add(ThreadsApi)
  .add(MessagesApi)
  .add(SuggestionsApi)
  .add(MemoriesExtraApi)
  .add(DiscordApi);

export class CoreApi extends CoreApiBase {}

export class EmiApi extends CoreApiBase.add(AnalyticsApi)
  .add(DataApi)
  .add(PrivacyApi)
  .add(WorkoutsApi)
  .add(HevyIntegrationApi) {}

export const HealthFitApi = EmiApi;
