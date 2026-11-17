// SPDX-License-Identifier: Apache-2.0
/**
 * Mirror engine for the bot's state tables: SQLite (the runtime source) into the PostgreSQL
 * schema `bot` (the replica). The engine lives in `@aphrody/shenron-db/replica`, shared with the
 * bot's periodic synchronisation; this module only keeps the historical import path of the manual
 * script (`sync-bot-runtime-sqlite-to-postgres.ts`) and of its tests.
 */
export * from "@aphrody/shenron-db/replica";
