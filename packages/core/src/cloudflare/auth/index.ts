export {
  anonymousSignInPath,
  createAnonymousSessionResponse,
  createSessionCookie,
  isTrustedAuthOrigin,
} from "./anonymous-session.ts";
export { makeAuth, type AuthConfiguration } from "./make-auth.ts";
export {
  authenticateRequest,
  authenticateWorkerFetch,
  CurrentRequestContext,
  getAuthConfiguration,
  handleAuthRequest,
  makeAuthRequestContext,
  readDemoPrincipalFromHeader,
  withCurrentUser,
  withRequestContext,
  type AuthDatabaseClient,
  type AuthPolicy,
  type AuthPrincipal,
  type RequestContext,
} from "./request-auth.ts";
export {
  CurrentUser,
  createAnonymousEmail,
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  isGenericProtectedPath,
  isProtectedPath,
  parseAllowedEmails,
} from "../../server/legacy/index.ts";
