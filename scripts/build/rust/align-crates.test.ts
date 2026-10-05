// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { alignManifest } from "./align-crates.ts";

const upstream = `[package]
name = "koharu-demo"
version = "0.83.5"
edition = "2024"
description = "Manga translation tools"
license = "MIT OR Apache-2.0"
authors = ["Mayo Takanashi <mayo@linux.com>", "Wangchong Zhou <fffonion@gmail.com>"]
homepage = "https://koharu.rs"
publish = false
[dependencies]
anyhow = { workspace = true }
`;

const owned = `# SPDX-License-Identifier: Apache-2.0
[package]
name = "shenron-demo"
version = "1.0.0"
edition = "2024"
license = "Apache-2.0"
authors = [
    "aphrody-dev <contact@aphrody.com>",
]

[dependencies]
serde = { workspace = true }
`;

describe("alignManifest", () => {
  test("upstream Koharu crates inherit version, edition, rust-version and lints only", () => {
    const result = alignManifest(upstream, "1.1.0");
    expect(result.problems).toEqual([]);
    expect(result.versionChanged).toBe(true);
    expect(result.text).toBe(`[package]
name = "koharu-demo"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
description = "Manga translation tools"
license = "MIT OR Apache-2.0"
authors = ["Mayo Takanashi <mayo@linux.com>", "Wangchong Zhou <fffonion@gmail.com>"]
homepage = "https://koharu.rs"
publish = false

[lints]
workspace = true

[dependencies]
anyhow = { workspace = true }
`);
  });

  test("Shenron crates inherit every package key, multi-line arrays included", () => {
    const result = alignManifest(owned, "1.1.0");
    expect(result.problems).toEqual([]);
    const parsed = Bun.TOML.parse(result.text) as Record<string, any>;
    for (const key of [
      "version",
      "edition",
      "rust-version",
      "license",
      "authors",
      "homepage",
      "repository",
    ]) {
      expect(parsed.package[key]).toEqual({ workspace: true });
    }
    expect(parsed.lints).toEqual({ workspace: true });
    expect(parsed.dependencies.serde).toEqual({ workspace: true });
    expect(result.text.startsWith("# SPDX-License-Identifier: Apache-2.0\n")).toBe(true);
  });

  test("is idempotent", () => {
    for (const manifest of [upstream, owned]) {
      const once = alignManifest(manifest, "1.1.0");
      const twice = alignManifest(once.text, "1.1.0");
      expect(twice.changes).toEqual([]);
      expect(twice.text).toBe(once.text);
    }
  });

  test("reports what it cannot fix", () => {
    const relicensed = upstream.replace('"MIT OR Apache-2.0"', '"MIT"');
    expect(alignManifest(relicensed, "1.1.0").problems).toHaveLength(1);
    const ownLints = `${owned}\n[lints.clippy]\ntodo = "deny"\n`;
    expect(alignManifest(ownLints, "1.1.0").problems).toEqual([
      "[lints] has its own levels: move them to [workspace.lints] of Cargo.toml",
    ]);
  });
});
