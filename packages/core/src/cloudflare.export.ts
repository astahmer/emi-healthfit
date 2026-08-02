import {
  anonymousSignInPath,
  createAnonymousSessionResponse,
  createSessionCookie,
  isTrustedAuthOrigin,
} from "./cloudflare/auth/anonymous-session.ts";
import { makeAuth, type AuthConfiguration } from "./cloudflare/auth/make-auth.ts";
import {
  authenticateRequest,
  authenticateWorkerFetch,
  getAuthConfiguration,
  handleAuthRequest,
  readDemoPrincipalFromHeader,
  type AuthDatabaseClient,
  type AuthPolicy,
} from "./cloudflare/auth/request-auth.ts";
import {
  createAnonymousEmail,
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  parseAllowedEmails,
} from "./server/auth/emails.ts";
import { isGenericProtectedPath, isProtectedPath } from "./server/auth/paths.ts";
import {
  CurrentUser,
  makeAuthRequestContext,
  withCurrentUser,
  type AuthPrincipal,
} from "./server/auth/principal.ts";
import {
  CurrentRequestContext,
  withRequestContext,
  type RequestContext,
} from "./server/request-context.ts";
import { makeGenericChatRoutes } from "./cloudflare/chat-routes.ts";
import {
  CloudflareDatabase,
  type CloudflareQueryDatabaseClient,
  type RawQueryDatabaseClient,
} from "./cloudflare/db/client.ts";
 

export class Cloudflare {
  private constructor() {}

  static readonly auth = {
    anonymousSignInPath,
    authenticateRequest,
    authenticateWorkerFetch,
    createAnonymousEmail,
    createAnonymousSessionResponse,
    createSessionCookie,
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
  } as const;

  static readonly database = CloudflareDatabase;

  static readonly request = {
    CurrentRequestContext,
    withRequestContext,
  } as const;

  static readonly user = {
    CurrentUser,
  } as const;

  static readonly routes = {
    makeGenericChatRoutes,
  } as const;
}

export type {
  AuthConfiguration,
  AuthDatabaseClient,
  AuthPolicy,
  AuthPrincipal,
  CloudflareQueryDatabaseClient,
  RawQueryDatabaseClient,
  RequestContext,
};
