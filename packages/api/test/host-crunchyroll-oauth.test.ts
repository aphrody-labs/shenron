// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricEncrypt } from "better-auth/crypto";
import { buildHostAuthOptions } from "../src/host/auth";

const secret = "registered-test-secret-".repeat(3);
const base = {
  DISCORD_CLIENT_ID: "registered-discord",
  DISCORD_CLIENT_SECRET: "registered-secret",
  BETTER_AUTH_SECRET: secret,
};
test("Crunchyroll joins existing OAuth providers only after explicit registered configuration", () => {
  const options = buildHostAuthOptions(base, undefined);
  const configured = buildHostAuthOptions(
    {
      ...base,
      CRUNCHYROLL_OAUTH_CLIENT_ID: "registered-client",
      CRUNCHYROLL_OAUTH_DISCOVERY_URL:
        "https://auth.crunchyroll.com/.well-known/openid-configuration",
    },
    undefined,
  );
  if ("reason" in options || "reason" in configured) throw Error("Missing base auth configuration");
  expect(options.plugins?.map((plugin) => plugin.id)).toContain("bearer");
  expect(options.plugins?.map((plugin) => plugin.id)).toContain("oauth-provider");
  expect(options.plugins?.map((plugin) => plugin.id)).toContain("cimd");
  expect(options.plugins?.map((plugin) => plugin.id)).not.toContain("generic-oauth");
  expect(configured.plugins?.map((plugin) => plugin.id)).toContain("generic-oauth");
  expect(configured.socialProviders?.discord).toBeDefined();
  expect(configured.account?.encryptOAuthTokens).toBe(true);
});
test("Better Auth encryption preserves existing plaintext token reads and decrypts new tokens", async () => {
  for (const stored of [
    "legacy-provider-token",
    await symmetricEncrypt({ key: secret, data: "legacy-provider-token" }),
  ]) {
    const options = buildHostAuthOptions(base, undefined);
    if ("reason" in options) throw Error(options.reason);
    const auth = betterAuth({
      ...options,
      baseURL: "http://localhost:3000",
      logger: { disabled: true },
      database: memoryAdapter({
        user: [],
        session: [],
        verification: [],
        twoFactor: [],
        passkey: [],
        jwks: [],
        oauthClient: [],
        oauthResource: [],
        oauthClientResource: [],
        oauthRefreshToken: [],
        oauthAccessToken: [],
        oauthConsent: [],
        oauthClientAssertion: [],
        account: [
          {
            id: "account-id",
            userId: "existing-user",
            providerId: "discord",
            accountId: "existing-provider-id",
            accessToken: stored,
            accessTokenExpiresAt: new Date(Date.now() + 3600000),
          },
        ],
      }),
    });
    const token = await auth.api.getAccessToken({
      body: { accountId: "account-id", userId: "existing-user" },
    });
    expect(token.accessToken).toBe("legacy-provider-token");
  }
});
