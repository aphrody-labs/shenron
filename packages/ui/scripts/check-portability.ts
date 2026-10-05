/**
 * Ensure package source can be installed without the host application: no Next.js, no app
 * code (`@/`, `@shenron/{site,bot,server}`), no self-import, and every other `@shenron/*`
 * import is a declared dependency (the allowed graph itself is audited by
 * scripts/audit/check-workspace-packages.ts).
 */
import { resolve } from "node:path";
import { uiAssetPaths } from "../src/assets";

const root = resolve(import.meta.dir, "..");
const manifest = await Bun.file(resolve(root, "package.json")).json();
const forbidden = /^(?:next(?:\/|$)|@\/|server-only$|@shenron\/(?:site|bot|server|ui)(?:\/|$))/;
const declared = new Set(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }));
const failures: string[] = [];

function workspacePackage(specifier: string): string | null {
  const match = /^(@shenron\/[^/]+)/.exec(specifier);
  return match ? match[1]! : null;
}

for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: resolve(root, "src") })) {
  const file = resolve(root, "src", path);
  const source = await Bun.file(file).text();
  const imports = source.matchAll(
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)["']([^"']+)["']/g,
  );
  for (const match of imports) {
    const specifier = match[1]!;
    if (forbidden.test(specifier)) failures.push(`${path}: ${specifier}`);
    const owner = workspacePackage(specifier);
    if (owner && !forbidden.test(specifier) && !declared.has(owner))
      failures.push(`${path}: ${specifier} (undeclared)`);
  }
}

for (const [key, target] of Object.entries(manifest.exports as Record<string, string>)) {
  if (key.includes("*") || target.includes("*")) continue;
  if (!(await Bun.file(resolve(root, target)).exists()))
    failures.push(`missing export ${key}: ${target}`);
}
for (const section of ["dependencies", "peerDependencies"] as const) {
  for (const name of Object.keys(manifest[section] ?? {})) {
    if (forbidden.test(name)) failures.push(`package.json ${section}: ${name}`);
  }
}

const declaredAssets = new Set<string>(uiAssetPaths);
for (const asset of declaredAssets) {
  if (!(await Bun.file(resolve(root, "assets", asset)).exists()))
    failures.push(`missing asset: ${asset}`);
}
for await (const asset of new Bun.Glob("**/*.{svg,png,ico}").scan({
  cwd: resolve(root, "assets"),
})) {
  if (!declaredAssets.has(asset.replaceAll("\\", "/"))) failures.push(`unlisted asset: ${asset}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Portable UI: no Next.js or application imports; exports and ${declaredAssets.size} assets resolve`,
  );
}
