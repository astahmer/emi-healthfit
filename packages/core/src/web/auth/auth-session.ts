import { assign, createActor, fromPromise, setup } from "xstate";

type AuthSessionContext = {
  readonly signInAsGuest: () => Promise<boolean>;
  readonly signInWithOAuth: () => Promise<boolean>;
  readonly pending: "guest" | "oauth" | undefined;
};

type AuthSessionEvent = { readonly type: "guest-requested" } | { readonly type: "oauth-requested" };

const authSessionMachine = setup({
  types: {
    context: {} as AuthSessionContext,
    input: {} as Omit<AuthSessionContext, "pending">,
    events: {} as AuthSessionEvent,
  },
  actors: {
    authenticate: fromPromise<boolean, { readonly action: () => Promise<boolean> }>(({ input }) =>
      input.action(),
    ),
  },
}).createMachine({
  id: "authSession",
  initial: "signed-out",
  context: ({ input }) => ({ ...input, pending: undefined }),
  states: {
    "signed-out": {
      on: {
        "guest-requested": {
          target: "starting",
          actions: assign({ pending: () => "guest" }),
        },
        "oauth-requested": {
          target: "starting",
          actions: assign({ pending: () => "oauth" }),
        },
      },
    },
    starting: {
      invoke: {
        src: "authenticate",
        input: ({ context }) => ({
          action: context.pending === "guest" ? context.signInAsGuest : context.signInWithOAuth,
        }),
        onDone: [
          {
            target: "authenticated",
            guard: ({ event }) => event.output,
          },
          { target: "error" },
        ],
        onError: "error",
      },
    },
    authenticated: {},
    error: {
      on: {
        "guest-requested": {
          target: "starting",
          actions: assign({ pending: () => "guest" }),
        },
        "oauth-requested": {
          target: "starting",
          actions: assign({ pending: () => "oauth" }),
        },
      },
    },
  },
});

export class AuthSession {
  private readonly actor;

  constructor({
    signInAsGuest,
    signInWithOAuth,
  }: {
    readonly signInAsGuest: () => Promise<boolean>;
    readonly signInWithOAuth: () => Promise<boolean>;
  }) {
    this.actor = createActor(authSessionMachine, {
      input: { signInAsGuest, signInWithOAuth },
    }).start();
  }

  readonly getState = (): "signed-out" | "starting" | "authenticated" | "error" => {
    const snapshot = this.actor.getSnapshot();
    if (snapshot.matches("starting")) return "starting";
    if (snapshot.matches("authenticated")) return "authenticated";
    if (snapshot.matches("error")) return "error";
    return "signed-out";
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    const subscription = this.actor.subscribe(listener);
    return () => subscription.unsubscribe();
  };

  readonly signInAsGuest = (): void => {
    this.actor.send({ type: "guest-requested" });
  };

  readonly signInWithOAuth = (): void => {
    this.actor.send({ type: "oauth-requested" });
  };

  readonly dispose = (): void => {
    this.actor.stop();
  };
}
