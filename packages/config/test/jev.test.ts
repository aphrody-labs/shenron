// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { resolveJev } from "../src/jev";

test("Jev config exposes only readiness and honors explicit disable", () => {
  expect(resolveJev({})).toEqual({ enabled: false, credentialPresent: false });
  expect(resolveJev({ SHENRON_JEV: "on" })).toEqual({ enabled: true, credentialPresent: false });
  expect(resolveJev({ TYPESAFE_API_KEY: "private-placeholder" })).toEqual({
    enabled: true,
    credentialPresent: true,
  });
  expect(resolveJev({ TYPESAFE_API_KEY: "private-placeholder", SHENRON_JEV: "off" })).toEqual({
    enabled: false,
    credentialPresent: true,
  });
  expect(JSON.stringify(resolveJev({ TYPESAFE_API_KEY: "private-placeholder" }))).not.toContain(
    "private-placeholder",
  );
});
