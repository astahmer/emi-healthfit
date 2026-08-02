import {
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
} from "./cloudflare-auth.export.ts";
import { makeGenericChatRoutes } from "./cloudflare/chat-routes.ts";
import {
  makeD1Kysely,
  makeQueryDatabaseClient,
} from "./cloudflare/db/client.ts";
import { QueryDatabase } from "./server/db/query-database.ts";
import type {
  RawQueryDatabaseClient,
  CloudflareQueryDatabaseClient,
} from "./cloudflare/db/client.ts";
import type {
  AuthConfiguration,
  AuthDatabaseClient,
  AuthPolicy,
  AuthPrincipal,
  RequestContext,
} from "./cloudflare-auth.export.ts";

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
  makeD1Kysely,
  makeGenericChatRoutes,
  makeQueryDatabaseClient,
  parseAllowedEmails,
  readDemoPrincipalFromHeader,
  QueryDatabase,
  withCurrentUser,
  withRequestContext,
};

export type {
  AuthConfiguration,
  AuthDatabaseClient,
  AuthPolicy,
  AuthPrincipal,
  CloudflareQueryDatabaseClient,
  RawQueryDatabaseClient,
  RequestContext,
};
