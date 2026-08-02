import {
  createAnonymousEmail,
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  parseAllowedEmails,
} from "./auth/emails.ts";
import { isGenericProtectedPath, isProtectedPath } from "./auth/paths.ts";
import {
  CurrentUser,
  makeAuthRequestContext,
  withCurrentUser,
} from "./auth/principal.ts";
import type { AuthPrincipal } from "./auth/principal.ts";

export {
  createAnonymousEmail,
  CurrentUser,
  isAnonymousEmail,
  isAuthorizedAuthEmail,
  isGenericProtectedPath,
  isProtectedPath,
  makeAuthRequestContext,
  parseAllowedEmails,
  withCurrentUser,
};

export type { AuthPrincipal };
