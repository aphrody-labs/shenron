// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { crunchyrollOAuthConfig } from "./options";
test("provider registration stays absent without issued application configuration", () => {
  expect(crunchyrollOAuthConfig({})).toBeNull();
  expect(crunchyrollOAuthConfig({ clientId: "registered" })).toBeNull();
  for (const discoveryUrl of [
    "http://localhost/.well-known/openid-configuration",
    "https://crunchyroll.com.evil.test/.well-known/openid-configuration",
    "https://user:secret@crunchyroll.com/.well-known/openid-configuration",
    "https://crunchyroll.com/.well-known/openid-configuration?token=secret",
    "https://crunchyroll.com/token",
  ])
    expect(crunchyrollOAuthConfig({ clientId: "registered", discoveryUrl })).toBeNull();
});
test("registered OIDC configuration requires PKCE, verified identity and explicit account linking", () => {
  const config = crunchyrollOAuthConfig({
    clientId: "registered",
    discoveryUrl: "https://auth.crunchyroll.com/issuer/.well-known/openid-configuration",
  });
  expect(config).toMatchObject({
    providerId: "crunchyroll",
    pkce: true,
    responseType: "code",
    requireIdTokenVerification: true,
    disableSignUp: true,
    disableImplicitSignUp: true,
  });
  expect(config?.clientSecret).toBeUndefined();
});
