// SPDX-License-Identifier: Apache-2.0
import { cpSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { flattenStandalone } from "@aphrody/next-bun/standalone";

interface ExternalAlias {
  path: string;
  name: string;
  version: string;
  request: string;
  importer: string;
}

function isInside(root: string, path: string): boolean {
  const part = relative(root, path);
  return (
    part !== "" &&
    part !== ".." &&
    !part.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(part)
  );
}

/** Keep Turbopack's hashed external package names after the isolated store is removed. */
export function flattenStandaloneExternals(directory: string) {
  const root = realpathSync(directory);
  const aliases: ExternalAlias[] = [];
  const walk = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      // Store entries use canonical names; traversing them cannot discover app externals.
      if (entry.name === ".bun" && path.endsWith("node_modules")) continue;
      if (entry.isSymbolicLink() && /-[a-f0-9]{16}$/.test(entry.name)) {
        const parent = dirname(file);
        const scoped = parent.split(/[\\/]/).at(-1)?.startsWith("@");
        const modules = scoped ? dirname(parent) : parent;
        if (modules.split(/[\\/]/).at(-1) !== "node_modules") continue;
        const target = realpathSync(file);
        if (!isInside(root, target)) throw new Error(`External alias escapes standalone: ${file}`);
        const manifest = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
        if (
          typeof manifest.name !== "string" ||
          !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(manifest.name) ||
          typeof manifest.version !== "string"
        ) {
          throw new Error(`Invalid external package identity: ${file}`);
        }
        aliases.push({
          path: file,
          name: manifest.name,
          version: manifest.version,
          request: relative(modules, file).replaceAll("\\", "/"),
          importer: dirname(modules),
        });
      } else if (entry.isDirectory()) walk(file);
    }
  };
  walk(root);

  const result = flattenStandalone(root);
  for (const alias of aliases) {
    const canonical = realpathSync(join(root, "node_modules", alias.name));
    if (!isInside(root, canonical))
      throw new Error(`External package escapes standalone: ${alias.name}`);
    const manifest = JSON.parse(readFileSync(join(canonical, "package.json"), "utf8"));
    if (manifest.name !== alias.name || manifest.version !== alias.version) {
      throw new Error(`External package identity changed while flattening: ${alias.request}`);
    }
    // Copy only the already flattened package, not the store or dependency symlinks.
    cpSync(canonical, alias.path, { recursive: true, dereference: true });
    const resolved = resolve(Bun.resolveSync(alias.request, alias.importer));
    if (!isInside(root, resolved) || !lstatSync(resolved).isFile()) {
      throw new Error(`Unresolved standalone external: ${alias.request}`);
    }
  }
  return { ...result, externalAliases: aliases.map(({ path }) => relative(root, path)) };
}
