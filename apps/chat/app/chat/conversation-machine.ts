import { fromPromise } from "xstate";
import {
  conversationMachine as baseConversationMachine,
  type ConversationLoadOutput,
} from "@emi/core/web";
import {
  compactConversation as compactConversationApi,
  discardThread as discardThreadApi,
  fetchConversationMessages,
  forkThread as forkThreadApi,
  loadConversationMessages,
  pinThread as pinThreadApi,
  renameConversation as renameConversationApi,
  renameThread as renameThreadApi,
  restoreThread as restoreThreadApi,
} from "../conversations";

export const conversationMachine = baseConversationMachine.provide({
  actors: {
    loadConversation: fromPromise(
      async ({
        input,
        signal,
      }: {
        input: { conversationId: string | undefined };
        signal: AbortSignal;
      }): Promise<ConversationLoadOutput> => {
        if (input.conversationId === undefined) throw new Error("conversationId is required");
        return loadConversationMessages(input.conversationId, signal);
      },
    ),
    refreshConversation: fromPromise(
      async ({
        input,
      }: {
        input: { conversationId: string | undefined; enabled: boolean };
      }) => {
        if (!input.enabled || input.conversationId === undefined) return undefined;
        return fetchConversationMessages(input.conversationId);
      },
    ),
    forkThread: fromPromise(
      async ({
        input,
      }: {
        input: { conversationId: string; anchorMessageId: string; title?: string };
      }) => forkThreadApi(input.conversationId, input.anchorMessageId, input.title),
    ),
    renameConversation: fromPromise(
      async ({ input }: { input: { conversationId: string; title: string } }) =>
        renameConversationApi(input.conversationId, input.title),
    ),
    renameThread: fromPromise(
      async ({ input }: { input: { threadId: string; title: string } }) =>
        renameThreadApi(input.threadId, input.title),
    ),
    pinThread: fromPromise(
      async ({ input }: { input: { threadId: string; pinned: boolean } }) =>
        pinThreadApi(input.threadId, input.pinned),
    ),
    discardThread: fromPromise(async ({ input }: { input: { threadId: string } }) =>
      discardThreadApi(input.threadId),
    ),
    restoreThread: fromPromise(async ({ input }: { input: { threadId: string } }) =>
      restoreThreadApi(input.threadId),
    ),
    compactConversation: fromPromise(
      async ({
        input,
      }: {
        input: {
          conversationId: string;
          config: { apiKey: string; baseUrl?: string; model: string };
        };
      }) => compactConversationApi(input),
    ),
  },
});
