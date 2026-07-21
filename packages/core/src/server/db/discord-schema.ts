import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Kyselify } from "drizzle-orm/kysely";

export const discordAccountLinks = sqliteTable(
  "discord_account_links",
  {
    discord_user_id: text().primaryKey(),
    user_id: text().notNull(),
    created_at: text().notNull(),
  },
  (table) => [index("idx_discord_account_links_user_id").on(table.user_id)],
);

export const discordLinkCodes = sqliteTable(
  "discord_link_codes",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    code_hash: text().notNull(),
    expires_at: text().notNull(),
    consumed_at: text(),
    created_at: text().notNull(),
  },
  (table) => [
    uniqueIndex("idx_discord_link_codes_code_hash").on(table.code_hash),
    index("idx_discord_link_codes_user_id").on(table.user_id),
  ],
);

export type DiscordAccountLinkRow = typeof discordAccountLinks.$inferSelect;
export type DiscordLinkCodeRow = typeof discordLinkCodes.$inferSelect;

export interface DiscordDatabaseSchema {
  discord_account_links: Kyselify<typeof discordAccountLinks>;
  discord_link_codes: Kyselify<typeof discordLinkCodes>;
}
