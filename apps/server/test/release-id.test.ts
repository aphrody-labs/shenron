// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { releaseId } from "../src/version";

describe("releaseId", () => {
  const sha = "feb3158a9962e0f9fca7e66711f415b65a208e5c";
  test("SHENRON_RELEASE puis SHENRON_REVISION, en sha court de 8 caracteres", () => {
    expect(releaseId({ SHENRON_RELEASE: sha })).toBe("feb3158a");
    expect(releaseId({ SHENRON_REVISION: sha.toUpperCase() })).toBe("feb3158a");
    expect(releaseId({ SHENRON_RELEASE: "a47d2612", SHENRON_REVISION: sha })).toBe("a47d2612");
  });
  test("ne divulgue jamais une valeur qui n'est pas un sha", () => {
    expect(releaseId({})).toBeNull();
    expect(releaseId({ SHENRON_RELEASE: "unknown" })).toBeNull();
    expect(releaseId({ SHENRON_RELEASE: "postgres://user:secret@db/x" })).toBeNull();
    expect(releaseId({ SHENRON_RELEASE: "local" })).toBeNull();
  });
});
