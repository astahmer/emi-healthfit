import {
  agentSignInPath,
  AgentSessionError,
  createAgentSessionResponse,
  createAgentSessionResponseEffect,
  isLocalAgentAuthUrl,
} from "./cloudflare/auth/agent-session.ts";
import {
  anonymousSignInPath,
  AnonymousSessionError,
  createAnonymousSessionResponse,
  createAnonymousSessionResponseEffect,
  createSessionCookie,
  createSessionCookieEffect,
  isTrustedAuthOrigin,
} from "./cloudflare/auth/anonymous-session.ts";
import { makeAuth, type AuthConfiguration } from "./cloudflare/auth/make-auth.ts";
import {
  authenticateRequest,
  authenticateWorkerFetch,
  getAuthConfiguration,
  handleAuthRequest,
  readDemoPrincipalFromHeader,
  AuthError,
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
import { ChatRouteApp } from "./cloudflare/chat-route-app.ts";
import {
  CloudflareDatabase,
  type DatabaseRuntime as DatabaseRuntimeRecord,
  type CloudflareQueryDatabaseClient,
  type RawQueryDatabaseClient,
} from "./cloudflare/db/client.ts";

export class Cloudflare {
  static readonly auth = {
    agentSignInPath,
    anonymousSignInPath,
    authenticateRequest,
    authenticateWorkerFetch,
    createAgentSessionResponse,
    createAgentSessionResponseEffect,
    createAnonymousEmail,
    createAnonymousSessionResponse,
    createAnonymousSessionResponseEffect,
    createSessionCookie,
    createSessionCookieEffect,
    getAuthConfiguration,
    handleAuthRequest,
    isAnonymousEmail,
    isAuthorizedAuthEmail,
    isGenericProtectedPath,
    isLocalAgentAuthUrl,
    isProtectedPath,
    isTrustedAuthOrigin,
    makeAuth,
    makeAuthRequestContext,
    parseAllowedEmails,
    readDemoPrincipalFromHeader,
    withCurrentUser,
    errors: {
      AgentSessionError,
      AnonymousSessionError,
      AuthError,
    },
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
    ChatRouteApp,
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

export type DatabaseRuntime = DatabaseRuntimeRecord;
