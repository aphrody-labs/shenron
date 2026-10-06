-- One Better Auth account per provider identity. Duplicate (providerId, accountId) rows make
-- Better Auth refuse every OAuth callback for that user ("Multiple accounts match the same
-- accountId"). Duplicates were purged on 2026-10-06 before this index. Idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS "ba_account_provider_account_uidx"
  ON "ba_account" ("providerId", "accountId");
