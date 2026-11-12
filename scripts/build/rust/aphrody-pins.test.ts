// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { alignAphrodyPins } from "./aphrody-pins.ts";

const oldRevision = "a".repeat(40);
const revision = "b".repeat(40);
const git = "https://github.com/aphrody-labs/aphrody";

test("aligns aliases and generated dependencies without changing their contracts", () => {
  const manifest = `alias = { git = "${git}", rev = "${oldRevision}", package = "aphrody-models", version = "1.0.0", features = ["local"] }
aphrody-models = { git = "${git}", rev = "${oldRevision}", version = "1.0.0" }
external = { git = "https://google.com/other", rev = "${oldRevision}" }
local = { path = "crates/local", version = "1.0.0" }
`;
  const aligned = alignAphrodyPins(manifest, revision);
  expect(aligned).toBe(
    manifest.replaceAll(`"${git}", rev = "${oldRevision}"`, `"${git}", rev = "${revision}"`),
  );
  expect(alignAphrodyPins(aligned, revision)).toBe(aligned);
});

test("rejects mutable or malformed pins", () => {
  expect(() => alignAphrodyPins(`dep = { git = "${git}", branch = "main" }`, revision)).toThrow(
    "immutable revision",
  );
  expect(() => alignAphrodyPins("", "main")).toThrow("invalid Aphrody revision");
});
