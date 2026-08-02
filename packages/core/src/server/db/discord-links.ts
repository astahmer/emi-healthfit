import * as Effect from "effect/Effect";
import type { QueryDatabaseClient } from "./query-database.ts";
import type { DiscordDatabaseSchema } from "./discord-schema.ts";

type DiscordDb = QueryDatabaseClient<DiscordDatabaseSchema>;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE_CODES_PER_USER = 3;

const nowIso = () => new Date().toISOString();

const bytesToHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const hashDiscordLinkCode = (code: string): Effect.Effect<string> =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(code.trim().toUpperCase()),
    );
    return bytesToHex(digest);
  });

const randomLinkCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
};

export interface DiscordLinkCodeView {
  id: string;
  expires_at: string;
  created_at: string;
  consumed_at: string | null;
}

export interface CreatedDiscordLinkCode {
  id: string;
  code: string;
  expires_at: string;
  created_at: string;
}

export interface DiscordAccountLinkView {
  discord_user_id: string;
  created_at: string;
}

const listDiscordLinkCodes = (db: DiscordDb, userId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const rows = yield* Effect.promise(() =>
      kysely
        .selectFrom("discord_link_codes")
        .select(["id", "expires_at", "created_at", "consumed_at"])
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .execute(),
    );
    return rows satisfies DiscordLinkCodeView[];
  });

const listDiscordAccountLinks = (db: DiscordDb, userId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const rows = yield* Effect.promise(() =>
      kysely
        .selectFrom("discord_account_links")
        .select(["discord_user_id", "created_at"])
        .where("user_id", "=", userId)
        .orderBy("created_at", "desc")
        .execute(),
    );
    return rows satisfies DiscordAccountLinkView[];
  });

const createDiscordLinkCode = (db: DiscordDb, userId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const active = yield* Effect.promise(() =>
      kysely
        .selectFrom("discord_link_codes")
        .select((eb) => eb.fn.countAll<number>().as("c"))
        .where("user_id", "=", userId)
        .where("consumed_at", "is", null)
        .where("expires_at", ">", nowIso())
        .executeTakeFirst(),
    );
    if ((active?.c ?? 0) >= MAX_ACTIVE_CODES_PER_USER) return null;

    const code = randomLinkCode();
    const codeHash = yield* hashDiscordLinkCode(code);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const id = crypto.randomUUID();

    yield* Effect.promise(() =>
      kysely
        .insertInto("discord_link_codes")
        .values({
          id,
          user_id: userId,
          code_hash: codeHash,
          expires_at: expiresAt,
          consumed_at: null,
          created_at: createdAt,
        })
        .execute(),
    );

    return {
      id,
      code,
      expires_at: expiresAt,
      created_at: createdAt,
    } satisfies CreatedDiscordLinkCode;
  });

const revokeDiscordLinkCode = (db: DiscordDb, userId: string, codeId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .deleteFrom("discord_link_codes")
        .where("user_id", "=", userId)
        .where("id", "=", codeId)
        .executeTakeFirst(),
    );
    return Number(result.numDeletedRows) > 0;
  });

const unlinkDiscordAccount = (db: DiscordDb, userId: string, discordUserId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .deleteFrom("discord_account_links")
        .where("user_id", "=", userId)
        .where("discord_user_id", "=", discordUserId)
        .executeTakeFirst(),
    );
    return Number(result.numDeletedRows) > 0;
  });

const getLinkedUserIdForDiscord = (db: DiscordDb, discordUserId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const row = yield* Effect.promise(() =>
      kysely
        .selectFrom("discord_account_links")
        .select("user_id")
        .where("discord_user_id", "=", discordUserId)
        .executeTakeFirst(),
    );
    return row?.user_id ?? null;
  });

const unlinkDiscordAccountByDiscordUserId = (db: DiscordDb, discordUserId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const result = yield* Effect.promise(() =>
      kysely
        .deleteFrom("discord_account_links")
        .where("discord_user_id", "=", discordUserId)
        .executeTakeFirst(),
    );
    return Number(result.numDeletedRows) > 0;
  });

export type ConsumeDiscordLinkCodeResult =
  | { readonly ok: true; readonly userId: string }
  | {
      readonly ok: false;
      readonly reason: "invalid" | "expired" | "consumed";
    };

const consumeDiscordLinkCode = (
  db: DiscordDb,
  options: { code: string; discordUserId: string },
) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const codeHash = yield* hashDiscordLinkCode(options.code);
    const row = yield* Effect.promise(() =>
      kysely
        .selectFrom("discord_link_codes")
        .select(["id", "user_id", "expires_at", "consumed_at"])
        .where("code_hash", "=", codeHash)
        .executeTakeFirst(),
    );
    if (row === undefined) return { ok: false, reason: "invalid" } as const;
    if (row.consumed_at !== null) return { ok: false, reason: "consumed" } as const;
    if (row.expires_at <= nowIso()) return { ok: false, reason: "expired" } as const;

    const consumedAt = nowIso();
    const updateResult = yield* Effect.promise(() =>
      kysely
        .updateTable("discord_link_codes")
        .set({ consumed_at: consumedAt })
        .where("id", "=", row.id)
        .where("user_id", "=", row.user_id)
        .where("consumed_at", "is", null)
        .executeTakeFirst(),
    );
    if (Number(updateResult.numUpdatedRows) === 0) {
      return { ok: false, reason: "consumed" } as const;
    }
    yield* Effect.promise(() =>
      kysely
        .insertInto("discord_account_links")
        .values({
          discord_user_id: options.discordUserId,
          user_id: row.user_id,
          created_at: consumedAt,
        })
        .onConflict((conflict) =>
          conflict.column("discord_user_id").doUpdateSet({
            user_id: row.user_id,
            created_at: consumedAt,
          }),
        )
        .execute(),
    );
    return { ok: true, userId: row.user_id } as const;
  });

export class DiscordLinkDatabase {
  private constructor() {}

  static readonly consumeLinkCode = consumeDiscordLinkCode;
  static readonly createLinkCode = createDiscordLinkCode;
  static readonly getLinkedUserId = getLinkedUserIdForDiscord;
  static readonly hashLinkCode = hashDiscordLinkCode;
  static readonly listAccountLinks = listDiscordAccountLinks;
  static readonly listLinkCodes = listDiscordLinkCodes;
  static readonly revokeLinkCode = revokeDiscordLinkCode;
  static readonly unlinkAccount = unlinkDiscordAccount;
  static readonly unlinkAccountByDiscordUserId = unlinkDiscordAccountByDiscordUserId;
}
