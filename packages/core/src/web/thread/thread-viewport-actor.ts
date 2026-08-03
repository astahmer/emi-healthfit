import { assign, setup } from "xstate";

export interface ThreadViewportActorInput {
  readonly sessionKey: string;
  readonly messageCount: number;
}

export interface ThreadViewportActorContext extends ThreadViewportActorInput {
  readonly positionedForSessionKey: string | null;
  readonly isAwayFromTop: boolean;
  readonly isAwayFromBottom: boolean;
  readonly canScrollToPreviousUserMessage: boolean;
}

export type ThreadViewportActorEvent =
  | { readonly type: "route-synced"; readonly sessionKey: string; readonly messageCount: number }
  | {
      readonly type: "viewport-measured";
      readonly scrollTop: number;
      readonly scrollHeight: number;
      readonly clientHeight: number;
      readonly canScrollToPreviousUserMessage: boolean;
    }
  | { readonly type: "position-applied" }
  | { readonly type: "empty-viewport-positioned" };

export const threadViewportActor = setup({
  types: {
    context: {} as ThreadViewportActorContext,
    events: {} as ThreadViewportActorEvent,
    input: {} as ThreadViewportActorInput,
  },
  actions: {
    syncRoute: assign(({ context, event }) => {
      if (event.type !== "route-synced") return context;
      const changedSession = event.sessionKey !== context.sessionKey;
      return {
        ...context,
        sessionKey: event.sessionKey,
        messageCount: event.messageCount,
        ...(changedSession
          ? {
              isAwayFromTop: false,
              isAwayFromBottom: false,
              canScrollToPreviousUserMessage: false,
            }
          : {}),
      };
    }),
    measureViewport: assign(({ context, event }) => {
      if (event.type !== "viewport-measured") return context;
      const distanceFromBottom = event.scrollHeight - event.scrollTop - event.clientHeight;
      return {
        ...context,
        isAwayFromTop: event.scrollTop > 24,
        isAwayFromBottom: distanceFromBottom > 160,
        canScrollToPreviousUserMessage: event.canScrollToPreviousUserMessage,
      };
    }),
    markPositioned: assign(({ context }) => ({
      ...context,
      positionedForSessionKey: context.messageCount > 0 ? context.sessionKey : null,
    })),
    markEmpty: assign(({ context }) => ({
      ...context,
      positionedForSessionKey: null,
      isAwayFromTop: false,
      isAwayFromBottom: false,
      canScrollToPreviousUserMessage: false,
    })),
  },
}).createMachine({
  id: "threadViewport",
  initial: "active",
  context: ({ input }) => ({
    sessionKey: input.sessionKey,
    messageCount: input.messageCount,
    positionedForSessionKey: null,
    isAwayFromTop: false,
    isAwayFromBottom: false,
    canScrollToPreviousUserMessage: false,
  }),
  states: {
    active: {
      on: {
        "route-synced": { actions: "syncRoute" },
        "viewport-measured": { actions: "measureViewport" },
        "position-applied": { actions: "markPositioned" },
        "empty-viewport-positioned": { actions: "markEmpty" },
      },
    },
  },
});

export const threadViewportNeedsInitialPosition = (context: ThreadViewportActorContext): boolean =>
  context.messageCount > 0 && context.positionedForSessionKey !== context.sessionKey;
