import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import {
  makeRequestContext as makeCoreRequestContext,
  type RequestContext,
} from "../request-context.ts";

export interface AuthPrincipal {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export const CurrentUser = Context.Reference<AuthPrincipal>("CurrentUser", {
  defaultValue: () => ({ id: "", email: "", name: "", image: null }),
});

export const withCurrentUser = <A, E, R>({
  effect,
  principal,
}: {
  effect: Effect.Effect<A, E, R>;
  principal: AuthPrincipal;
}) => Effect.provideService(effect, CurrentUser, principal);

export const makeAuthRequestContext = ({
  principal,
  requestId = crypto.randomUUID(),
}: {
  principal: AuthPrincipal;
  requestId?: string;
}): RequestContext => makeCoreRequestContext({ userId: principal.id, requestId });
