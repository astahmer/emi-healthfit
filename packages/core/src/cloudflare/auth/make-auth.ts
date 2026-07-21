import type { D1Database } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { authSchema } from "@emi/core/server";

export interface AuthConfiguration {
  appName: string;
  baseUrl: string;
  secret: string;
  allowedEmails: ReadonlySet<string>;
  google?: {
    clientId: string;
    clientSecret: string;
  };
}

export const makeAuth = ({
  database,
  configuration,
}: {
  database: D1Database;
  configuration: AuthConfiguration;
}) =>
  betterAuth({
    appName: configuration.appName,
    baseURL: configuration.baseUrl,
    secret: configuration.secret,
    trustedOrigins: [configuration.baseUrl],
    database: drizzleAdapter(drizzle(database, { schema: authSchema }), {
      provider: "sqlite",
      schema: authSchema,
    }),
    socialProviders:
      configuration.google === undefined
        ? undefined
        : {
            google: {
              clientId: configuration.google.clientId,
              clientSecret: configuration.google.clientSecret,
              prompt: "select_account",
            },
          },
    account: {
      accountLinking: { enabled: false },
    },
    databaseHooks:
      configuration.google === undefined
        ? undefined
        : {
            user: {
              create: {
                before: async (user) => {
                  const email = user.email.trim().toLowerCase();
                  if (!user.emailVerified || !configuration.allowedEmails.has(email)) return false;
                  return { data: { ...user, email } };
                },
              },
            },
          },
    advanced: {
      useSecureCookies: configuration.baseUrl.startsWith("https://"),
    },
  });
