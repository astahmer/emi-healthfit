import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { QueryDatabaseClient } from "./query-database.ts";
import type { DiscordDatabaseSchema } from "./discord-schema.ts";

type DiscordDb<Environment = never> = QueryDatabaseClient<DiscordDatabaseSchema, Environment>;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ACTIVE_CODES_PER_USER = 3;

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

const randomLinkCode = (randomBytes: (length: number) => Uint8Array): string => {
  const bytes = randomBytes(CODE_LENGTH);
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

const listDiscordLinkCodes = <Environment>(db: DiscordDb<Environment>, userId: string) =>
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

const listDiscordAccountLinks = <Environment>(db: DiscordDb<Environment>, userId: string) =>
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

const createDiscordLinkCode = <Environment>(db: DiscordDb<Environment>, userId: string) =>
  Effect.gen(function* () {
    const kysely = yield* db.kysely;
    const active = yield* Effect.promise(() =>
      kysely
        .selectFrom("discord_link_codes")
        .select((eb) => eb.fn.countAll<number>().as("c"))
        .where("user_id", "=", userId)
        .where("consumed_at", "is", null)
        .where("expires_at", ">", db.runtime.now())
        .executeTakeFirst(),
    );
    if ((active?.c ?? 0) >= MAX_ACTIVE_CODES_PER_USER) return null;

    const code = randomLinkCode(db.runtime.randomBytes);
    const codeHash = yield* hashDiscordLinkCode(code);
    const createdAt = db.runtime.now();
    const expiresAt = new Date(db.runtime.nowMilliseconds() + CODE_TTL_MS).toISOString();
    const id = db.runtime.createId();

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

const revokeDiscordLinkCode = <Environment>(
  db: DiscordDb<Environment>,
  userId: string,
  codeId: string,
) =>
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

const unlinkDiscordAccount = <Environment>(
  db: DiscordDb<Environment>,
  userId: string,
  discordUserId: string,
) =>
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

const getLinkedUserIdForDiscord = <Environment>(
  db: DiscordDb<Environment>,
  discordUserId: string,
) =>
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

const unlinkDiscordAccountByDiscordUserId = <Environment>(
  db: DiscordDb<Environment>,
  discordUserId: string,
) =>
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

const consumeDiscordLinkCode = <Environment>(
  db: DiscordDb<Environment>,
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
    if (row.expires_at <= db.runtime.now()) return { ok: false, reason: "expired" } as const;

    const consumedAt = db.runtime.now();
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

export interface DiscordLinkDatabaseShape {
  readonly consumeLinkCode: (input: {
    readonly code: string;
    readonly discordUserId: string;
  }) => Effect.Effect<ConsumeDiscordLinkCodeResult>;
  readonly createLinkCode: (input: {
    readonly userId: string;
  }) => Effect.Effect<CreatedDiscordLinkCode | null>;
  readonly getLinkedUserId: (input: {
    readonly discordUserId: string;
  }) => Effect.Effect<string | null>;
  readonly listAccountLinks: (input: {
    readonly userId: string;
  }) => Effect.Effect<ReadonlyArray<DiscordAccountLinkView>>;
  readonly listLinkCodes: (input: {
    readonly userId: string;
  }) => Effect.Effect<ReadonlyArray<DiscordLinkCodeView>>;
  readonly revokeLinkCode: (input: {
    readonly userId: string;
    readonly codeId: string;
  }) => Effect.Effect<boolean>;
  readonly unlinkAccount: (input: {
    readonly userId: string;
    readonly discordUserId: string;
  }) => Effect.Effect<boolean>;
  readonly unlinkAccountByDiscordUserId: (input: {
    readonly discordUserId: string;
  }) => Effect.Effect<boolean>;
}

export class DiscordLinkDatabase extends Context.Service<
  DiscordLinkDatabase,
  DiscordLinkDatabaseShape
>()("@emi/core/server/database/DiscordLinkDatabase") {
  static readonly consumeLinkCode = (input: {
    readonly code: string;
    readonly discordUserId: string;
  }) => Effect.flatMap(DiscordLinkDatabase, (database) => database.consumeLinkCode(input));

  static readonly createLinkCode = (input: { readonly userId: string }) =>
    Effect.flatMap(DiscordLinkDatabase, (database) => database.createLinkCode(input));

  static readonly getLinkedUserId = (input: { readonly discordUserId: string }) =>
    Effect.flatMap(DiscordLinkDatabase, (database) => database.getLinkedUserId(input));

  static readonly hashLinkCode = hashDiscordLinkCode;

  static readonly listAccountLinks = (input: { readonly userId: string }) =>
    Effect.flatMap(DiscordLinkDatabase, (database) => database.listAccountLinks(input));

  static readonly listLinkCodes = (input: { readonly userId: string }) =>
    Effect.flatMap(DiscordLinkDatabase, (database) => database.listLinkCodes(input));

  static readonly revokeLinkCode = (input: { readonly userId: string; readonly codeId: string }) =>
    Effect.flatMap(DiscordLinkDatabase, (database) => database.revokeLinkCode(input));

  static readonly unlinkAccount = (input: {
    readonly userId: string;
    readonly discordUserId: string;
  }) => Effect.flatMap(DiscordLinkDatabase, (database) => database.unlinkAccount(input));

  static readonly unlinkAccountByDiscordUserId = (input: { readonly discordUserId: string }) =>
    Effect.flatMap(DiscordLinkDatabase, (database) => database.unlinkAccountByDiscordUserId(input));

  static layer<Environment>({
    db,
  }: {
    readonly db: DiscordDb<Environment>;
  }): Layer.Layer<DiscordLinkDatabase, never, Environment> {
    return Layer.effect(
      DiscordLinkDatabase,
      Effect.gen(function* () {
        const context = yield* Effect.context<Environment>();
        const provide = <A>(effect: Effect.Effect<A, never, Environment>) =>
          Effect.provideContext(effect, context);
        return {
          consumeLinkCode: (input) => provide(consumeDiscordLinkCode(db, input)),
          createLinkCode: ({ userId }) => provide(createDiscordLinkCode(db, userId)),
          getLinkedUserId: ({ discordUserId }) =>
            provide(getLinkedUserIdForDiscord(db, discordUserId)),
          listAccountLinks: ({ userId }) => provide(listDiscordAccountLinks(db, userId)),
          listLinkCodes: ({ userId }) => provide(listDiscordLinkCodes(db, userId)),
          revokeLinkCode: ({ userId, codeId }) =>
            provide(revokeDiscordLinkCode(db, userId, codeId)),
          unlinkAccount: ({ userId, discordUserId }) =>
            provide(unlinkDiscordAccount(db, userId, discordUserId)),
          unlinkAccountByDiscordUserId: ({ discordUserId }) =>
            provide(unlinkDiscordAccountByDiscordUserId(db, discordUserId)),
        } satisfies DiscordLinkDatabaseShape;
      }),
    );
  }
}
