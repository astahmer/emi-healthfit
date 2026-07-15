import type { D1Database } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { authSchema } from "./schema.ts";

export interface AuthConfiguration {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  secret: string;
  allowedEmails: ReadonlySet<string>;
}

export const parseAllowedEmails = (value: string): ReadonlySet<string> =>
  new Set(
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== ""),
  );

export const makeAuth = ({
  database,
  configuration,
}: {
  database: D1Database;
  configuration: AuthConfiguration;
}) =>
  betterAuth({
    appName: "Emi HealthFit",
    baseURL: configuration.baseUrl,
    secret: configuration.secret,
    trustedOrigins: [configuration.baseUrl],
    database: drizzleAdapter(drizzle(database, { schema: authSchema }), {
      provider: "sqlite",
      schema: authSchema,
    }),
    socialProviders: {
      google: {
        clientId: configuration.clientId,
        clientSecret: configuration.clientSecret,
        prompt: "select_account",
      },
    },
    account: {
      accountLinking: { enabled: false },
    },
    databaseHooks: {
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
