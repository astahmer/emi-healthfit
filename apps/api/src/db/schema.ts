import { ServerDatabase } from "@emi/core/server/database";
import {
  HealthFit,
} from "@emi/flavor-healthfit";

const {
  bodyMetrics: healthfitBodyMetrics,
  dailyActivity: healthfitDailyActivity,
  healthWorkouts: healthfitHealthWorkouts,
  hevyConnections: healthfitHevyConnections,
  hevySessions: healthfitHevySessions,
  hevySets: healthfitHevySets,
  hevySyncState: healthfitHevySyncState,
  privacyPreferences: healthfitPrivacyPreferences,
  sleepSessions: healthfitSleepSessions,
  syncCursors: healthfitSyncCursors,
} = HealthFit.storage.tables;

export const bodyMetrics = healthfitBodyMetrics;
export const dailyActivity = healthfitDailyActivity;
export const healthWorkouts = healthfitHealthWorkouts;
export const hevyConnections = healthfitHevyConnections;
export const hevySessions = healthfitHevySessions;
export const hevySets = healthfitHevySets;
export const hevySyncState = healthfitHevySyncState;
export const privacyPreferences = healthfitPrivacyPreferences;
export const sleepSessions = healthfitSleepSessions;
export const syncCursors = healthfitSyncCursors;

export const authAccount = ServerDatabase.tables.auth.account;
export const authSession = ServerDatabase.tables.auth.session;
export const authUser = ServerDatabase.tables.auth.user;
export const authVerification = ServerDatabase.tables.auth.verification;
export const chatEvents = ServerDatabase.tables.chat.events;
export const chatGenerationChunks = ServerDatabase.tables.chat.generationChunks;
export const chatGenerations = ServerDatabase.tables.chat.generations;
export const conversations = ServerDatabase.tables.chat.conversations;
export const discordAccountLinks = ServerDatabase.tables.discord.accountLinks;
export const discordLinkCodes = ServerDatabase.tables.discord.linkCodes;
export const memories = ServerDatabase.tables.chat.memories;
export const memorySummaries = ServerDatabase.tables.chat.memorySummaries;
export const messages = ServerDatabase.tables.chat.messages;
export const notes = ServerDatabase.tables.chat.notes;
export const suggestions = ServerDatabase.tables.chat.suggestions;
export const threadMessages = ServerDatabase.tables.chat.threadMessages;
export const threads = ServerDatabase.tables.chat.threads;
