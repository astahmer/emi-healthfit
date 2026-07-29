import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export interface RequestContext {
  userId: string;
  requestId: string;
}

export const CurrentRequestContext = Context.Reference<RequestContext>("RequestContext", {
  defaultValue: () => ({ userId: "", requestId: "" }),
});

export const withRequestContext = <A, E, R>({
  effect,
  requestContext,
}: {
  effect: Effect.Effect<A, E, R>;
  requestContext: RequestContext;
}) => Effect.provideService(effect, CurrentRequestContext, requestContext);

export const makeRequestContext = ({
  userId,
  requestId = crypto.randomUUID(),
}: {
  userId: string;
  requestId?: string;
}): RequestContext => ({
  userId,
  requestId,
});
