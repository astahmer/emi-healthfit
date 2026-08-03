import { assign, setup } from "xstate";
import type { ChatModel } from "../models";

export interface ComposerConfigContext {
  model: string;
  coachMode: boolean;
  webSearch: boolean;
  temporary: boolean;
  savedModelRef: string | null;
  models: ChatModel[];
}

export type ComposerConfigEvent =
  | { type: "init"; config: Partial<ComposerConfigContext> }
  | { type: "model.select"; model: string }
  | { type: "coach.toggle" }
  | { type: "web.toggle"; value: boolean }
  | { type: "temporary.toggle"; value: boolean };

const findSupportedModel = (models: ChatModel[], currentModel: string): ChatModel | undefined => {
  const currentIdx = models.findIndex((m) => m.id === currentModel);
  return (
    models.find((model, index) => model.capabilities.webSearch && index >= currentIdx) ??
    models.find((model) => model.capabilities.webSearch)
  );
};

export const composerConfigMachine = setup({
  types: {
    context: {} as ComposerConfigContext,
    events: {} as ComposerConfigEvent,
    input: {} as { models: ChatModel[]; model: string; coachMode: boolean; webSearch: boolean },
  },
  guards: {
    canWebSearch: ({ context }) => {
      const selected = context.models.find((m) => m.id === context.model);
      return selected?.capabilities.webSearch ?? false;
    },
  },
}).createMachine({
  id: "composerConfig",
  initial: "idle",
  context: ({ input }) => ({
    model: input.model,
    coachMode: input.coachMode,
    webSearch: input.webSearch,
    temporary: false,
    savedModelRef: null,
    models: input.models,
  }),
  states: {
    idle: {
      on: {
        init: {
          actions: assign(({ context, event }) => ({
            ...context,
            ...event.config,
            savedModelRef: event.config.savedModelRef ?? context.savedModelRef,
          })),
        },
        "model.select": {
          actions: assign({
            model: ({ event }) => event.model,
            savedModelRef: ({ context, event }) => {
              const selected = context.models.find((m) => m.id === event.model);
              if (selected?.capabilities.webSearch) return null;
              return context.savedModelRef;
            },
          }),
        },
        "coach.toggle": {
          actions: assign({ coachMode: ({ context }) => !context.coachMode }),
        },
        "web.toggle": {
          actions: assign(({ context, event }) => {
            const next = event.value;
            if (next) {
              const selected = context.models.find((m) => m.id === context.model);
              if (selected?.capabilities.webSearch) {
                return { ...context, webSearch: true, savedModelRef: null };
              }
              const supported = findSupportedModel(context.models, context.model);
              if (supported) {
                return {
                  ...context,
                  model: supported.id,
                  webSearch: true,
                  savedModelRef: context.model,
                };
              }
              return { ...context, webSearch: true };
            }
            if (context.savedModelRef) {
              return {
                ...context,
                model: context.savedModelRef,
                webSearch: false,
                savedModelRef: null,
              };
            }
            return { ...context, webSearch: false };
          }),
        },
        "temporary.toggle": {
          actions: assign({ temporary: ({ event }) => event.value }),
        },
      },
    },
  },
});
