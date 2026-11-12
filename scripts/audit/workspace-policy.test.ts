// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PUBLIC_LIBRARY_FILES,
  pinnedAphrodyDependency,
  protectedPackagePath,
  publicationViolations,
  publicFileViolations,
} from "./workspace-policy";

function library() {
  return {
    name: "@aphrody/shenron-api",
    private: false,
    files: ["src", "LICENSE", "openapi"],
    license: "Apache-2.0",
    publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
    exports: { "./contract": "./src/contract/index.ts", "./openapi.json": "./openapi/public.json" },
  };
}

test("approved public libraries retain exact reviewed allowlists while applications remain private", () => {
  expect(publicationViolations(library(), "packages/api")).toEqual([]);
  expect(publicationViolations(library(), "apps/site")).toContain(
    "application or unapproved workspace must remain private",
  );
  expect(
    publicationViolations({ ...library(), name: "@aphrody/shenron-new" }, "packages/new"),
  ).toContain("application or unapproved workspace must remain private");
  expect(
    publicationViolations({ ...library(), files: ["."] }, "packages/api").length,
  ).toBeGreaterThan(0);
  expect(
    publicationViolations(
      { ...library(), files: ["src", "LICENSE", "openapi", "data/home"] },
      "packages/api",
    ),
  ).toContain("protected public allowlist path: data/home");
  expect(
    publicationViolations({ ...library(), exports: { "./secret": "./.env" } }, "packages/api")
      .length,
  ).toBeGreaterThan(0);
  expect(
    publicationViolations(
      { ...library(), exports: { "./secret": "./src/../../data/home/MEMORY.md" } },
      "packages/api",
    ).length,
  ).toBeGreaterThan(0);
  expect(
    publicationViolations(
      { ...library(), publishConfig: { access: "public", registry: "https://unapproved.example" } },
      "packages/api",
    ).length,
  ).toBeGreaterThan(0);
});

test("all thirteen current public manifests and their source payloads match reviewed notices and exports", async () => {
  const root = resolve(import.meta.dir, "../..");
  expect(Object.keys(PUBLIC_LIBRARY_FILES)).toHaveLength(13);
  for (const [name, files] of Object.entries(PUBLIC_LIBRARY_FILES)) {
    const relative = `packages/${name.slice("@aphrody/shenron-".length)}`;
    const manifest = await Bun.file(join(root, relative, "package.json")).json();
    expect(manifest.name).toBe(name);
    expect(publicationViolations(manifest, relative), relative).toEqual([]);
    expect(publicFileViolations(join(root, relative), files), relative).toEqual([]);
  }
});

test("source allowlists cannot conceal credentials, databases, provider stores or model weights", async () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-public-package-"));
  try {
    mkdirSync(join(root, "src"));
    await Bun.write(join(root, "src/index.ts"), "export const value = 1;\n");
    await Bun.write(join(root, "LICENSE"), "Apache-2.0 notice\n");
    expect(publicFileViolations(root, ["src", "LICENSE"])).toEqual([]);
    await Bun.write(join(root, "src/.env.local"), "SYNTHETIC_TEST=1\n");
    await Bun.write(join(root, "src/data/home/MEMORY.md"), "synthetic provider store\n");
    await Bun.write(join(root, "src/model.gguf"), "synthetic model fixture\n");
    const failures = publicFileViolations(root, ["src", "LICENSE"]);
    expect(failures).toHaveLength(3);
    expect(protectedPackagePath("src/sessions/session.json")).toBe(true);
    expect(protectedPackagePath("src/database.sqlite-wal")).toBe(true);
    expect(protectedPackagePath("src/cookie.json")).toBe(true);
    expect(protectedPackagePath("src/.envrc")).toBe(true);
    expect(protectedPackagePath("src/data/types.ts")).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("external capabilities use exact registry pins and local links remain confined to Shenron workspaces", () => {
  const local = new Set(["@aphrody/shenron-api", "@aphrody/shenron-config"]);
  expect(pinnedAphrodyDependency("@aphrody/shenron-api", "workspace:*", local)).toBe(true);
  expect(pinnedAphrodyDependency("@aphrody/shenron-unknown", "workspace:*", local)).toBe(false);
  expect(pinnedAphrodyDependency("@aphrody/http", "workspace:*", new Set(["@aphrody/http"]))).toBe(
    false,
  );
  expect(pinnedAphrodyDependency("@aphrody/http", "^0.1.1", local)).toBe(false);
  expect(pinnedAphrodyDependency("@aphrody/http", "0.1.1", local)).toBe(true);
  expect(pinnedAphrodyDependency("@aphrody/http", "file:../aphrody", local)).toBe(false);
  expect(pinnedAphrodyDependency("@aphrody/bun-video", "1.4.4-video.1", local)).toBe(true);
});

test("the reviewed Bun Video npm archive requires its exact CDN identity, source and integrity", () => {
  const name = "@aphrody/bun-video";
  // Keep the qualified historical archive as a fixture when the application moves to npm pins.
  const pin = {
    name,
    version: "1.4.4-video.1",
    source: "8ae3009ee97d6768d58b0ff09e840ff68fb2e24c",
    url: "https://dist.aphrody.app/packages/bun-video/1.4.4-video.1/db7590aff424cc85c783a316556b8552f780898f92d9765443092a5c69970056/package.tgz",
    sha256: "db7590aff424cc85c783a316556b8552f780898f92d9765443092a5c69970056",
    integrity:
      "sha512-FMYE7oRCfy31vNA9MVhQYVwdueRdhsmmOr++KPk2J7NlhfKzfIyVxiVnY8Uhg/2ayXbgoVxKBix5COkXBE6QuQ==",
  };
  const archives = { [name]: pin };
  const local = new Set<string>();
  expect(pinnedAphrodyDependency(name, pin.url, local, archives)).toBe(true);
  expect(pinnedAphrodyDependency(name, pin.url, local)).toBe(false);
  expect(pinnedAphrodyDependency("@aphrody/other", pin.url, local, archives)).toBe(false);
  for (const url of [
    pin.url.replace("https:", "http:"),
    pin.url.replace("dist.aphrody.app", "google.com"),
    pin.url.replace("dist.aphrody.app", "secret@dist.aphrody.app"),
    `${pin.url}?mutable=latest`,
    pin.url.replace(pin.sha256, "latest"),
  ]) {
    expect(pinnedAphrodyDependency(name, url, local, { [name]: { ...pin, url } })).toBe(false);
  }
  for (const invalid of [
    { source: "main" },
    { integrity: "" },
    { sha256: "short" },
    { version: "latest" },
  ]) {
    expect(pinnedAphrodyDependency(name, pin.url, local, { [name]: { ...pin, ...invalid } })).toBe(
      false,
    );
  }
});
