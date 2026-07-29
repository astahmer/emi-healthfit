import * as Schema from "effect/Schema";

const AnonymousEmail = Schema.String.check(
  Schema.isPattern(
    /^guest-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@anonymous\.emi\.invalid$/,
  ),
);

export const createAnonymousEmail = ({ id }: { id: string }): string =>
  `guest-${id}@anonymous.emi.invalid`;

export const isAnonymousEmail = (email: string): boolean =>
  Schema.is(AnonymousEmail)(email.trim().toLowerCase());

export const parseAllowedEmails = (value: string): ReadonlySet<string> =>
  new Set(
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== ""),
  );

export const isAuthorizedAuthEmail = ({
  allowedEmails,
  email,
  emailVerified,
}: {
  allowedEmails: ReadonlySet<string>;
  email: string;
  emailVerified: boolean;
}): boolean => isAnonymousEmail(email) || (emailVerified && allowedEmails.has(email));
