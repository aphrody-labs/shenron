// SPDX-License-Identifier: Apache-2.0
/**
 * `@shenron/db/conversations` — unified conversation store of the site, the desktop and the bot:
 * SQLite (local) and PostgreSQL (shared server, schema `chat`) stores with the same idempotent
 * push / incremental pull contract, the local replica of sync clients and the redaction applied
 * before conversations feed memory, RAG or training. Runtime class: `bun`.
 */
export * from "./pg";
export * from "./redact";
export * from "./replica";
export * from "./sqlite";
export * from "./types";
