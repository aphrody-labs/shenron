"use strict";
// `output: "standalone"` under Bun's isolated linker copies the traced packages
// as `node_modules/.bun/<pkg>@<version>/node_modules/<name>` plus symlinks. A
// tree that must not hold symlinks (an archive, a payload embedded in a
// compiled executable, a Windows copy) needs them flattened first.

const { cpSync, existsSync, lstatSync, readdirSync, realpathSync, rmSync } = require("node:fs");
const { isAbsolute, join, relative } = require("node:path");

function packagesIn(modules) {
  const names = [];
  for (const name of readdirSync(modules)) {
    if (name.startsWith(".")) continue;
    if (name.startsWith("@"))
      for (const scoped of readdirSync(join(modules, name))) names.push(`${name}/${scoped}`);
    else names.push(name);
  }
  return names;
}

/**
 * Replaces every symlink below `dir` by a copy of its target when that target is
 * inside `root`; deletes it otherwise (gone with the store, or outside the tree).
 */
function materializeSymlinks(dir, root) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      let target;
      try {
        target = realpathSync(path);
      } catch {}
      rmSync(path, { force: true });
      if (target && isInside(target, root))
        cpSync(target, path, { recursive: true, dereference: true });
    } else if (entry.isDirectory()) materializeSymlinks(path, root);
  }
}

/**
 * Hoists every package of `<root>/node_modules/.bun` to `<root>/node_modules/<name>`,
 * deletes the store, then replaces each remaining symlink by a copy of its target when it lies in
 * the tree (dropping links into the store or out of the tree). Throws when the trace holds two versions of one package,
 * which a flat tree cannot represent.
 *
 * @param {string} root the standalone directory (e.g. `.next/standalone`)
 * @returns {{ packages: string[] }} the hoisted package names
 */
function flattenStandalone(root) {
  const store = join(root, "node_modules", ".bun");
  if (!existsSync(store)) return { packages: [] };
  const hoisted = new Map();
  for (const entry of readdirSync(store)) {
    const modules = join(store, entry, "node_modules");
    if (!existsSync(modules)) continue;
    for (const name of packagesIn(modules)) {
      const path = join(modules, name);
      if (lstatSync(path).isSymbolicLink()) continue;
      const previous = hoisted.get(name);
      if (previous && previous !== path) {
        throw new Error(
          `@aphrody/shenron-next-host: two versions of ${name} in the standalone trace: ${previous} and ${path}`,
        );
      }
      hoisted.set(name, path);
    }
  }
  for (const [name, path] of hoisted) {
    const destination = join(root, "node_modules", name);
    if (isLink(destination)) rmSync(destination, { force: true });
    cpSync(path, destination, { recursive: true, dereference: true });
  }
  rmSync(store, { recursive: true, force: true });
  materializeSymlinks(root, realpathSync(root));
  return { packages: [...hoisted.keys()].sort() };
}

function isInside(path, root) {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

module.exports = { flattenStandalone };
