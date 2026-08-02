import {
  anonymousSignInPath,
  createAnonymousSessionResponse,
  createSessionCookie,
  isTrustedAuthOrigin,
} from "./cloudflare/auth/anonymous-session.ts";
import { makeAuth } from "./cloudflare/auth/make-auth.ts";
import {
  authenticateRequest,
  authenticateWorkerFetch,
  CurrentRequestContext,
  getAuthConfiguration,
  handleAuthRequest,
  makeAuthRequestContext,
  readDemoPrincipalFromHeader,
  withCurrentUser,
  withRequestContext,
} from "./cloudflare/auth/request-auth.ts";
import type {
  AuthDatabaseClient,
  AuthPolicy,
  AuthPrincipal,
  RequestContext,
} from "./cloudflare/auth/request-auth.ts";
import type { AuthConfiguration } from "./cloudflare/auth/make-auth.ts";
import {
  CurrentUser,
  createAnonymousEmail,
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  isGenericProtectedPath,
  isProtectedPath,
  parseAllowedEmails,
} from "./server/auth.export.ts";

export {
  anonymousSignInPath,
  authenticateRequest,
  authenticateWorkerFetch,
  createAnonymousEmail,
  createAnonymousSessionResponse,
  createSessionCookie,
  CurrentRequestContext,
  CurrentUser,
  getAuthConfiguration,
  handleAuthRequest,
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  isGenericProtectedPath,
  isProtectedPath,
  isTrustedAuthOrigin,
  makeAuth,
  makeAuthRequestContext,
  parseAllowedEmails,
  readDemoPrincipalFromHeader,
  withCurrentUser,
  withRequestContext,
};

export type {
  AuthConfiguration,
  AuthDatabaseClient,
  AuthPolicy,
  AuthPrincipal,
  RequestContext,
};
