// SPDX-License-Identifier: Apache-2.0
/**
 * DBXV2 est privé : aucune page publique, aucun dictionnaire public, aucune dépendance du site
 * ni aucun artefact de build ne le référence. Seuls l'espace admin dédié et ses bibliothèques
 * serveur le nomment, et le paquet privé n'est jamais importé statiquement (donc jamais empaqueté).
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { findDbxv2Leaks } from "../../../packages/dbxv2/src/guard";

const SITE = join(import.meta.dir, "..");
const SRC = join(SITE, "src");

const allowed = (rel: string): boolean =>
  rel.startsWith(`app${sep}admin${sep}dbxv2${sep}`) || /^lib[\\/]dbxv2[^\\/]*\.ts$/.test(rel);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(?:tsx?|jsx?|css|json|mdx?)$/.test(entry.name)) yield full;
  }
}

describe("pages publiques", () => {
  test("aucun fichier hors de l'espace admin dédié ne mentionne dbxv2", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      if (allowed(rel)) continue;
      if (/dbxv2/i.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  test("les dictionnaires publics ne contiennent aucune clé ni valeur dbxv2", () => {
    for (const locale of ["fr", "en", "ja"]) {
      const text = readFileSync(join(SITE, "messages", `${locale}.json`), "utf8");
      expect(/dbxv2/i.test(text)).toBe(false);
    }
  });

  test("le site ne dépend pas du paquet privé et ne l'importe jamais statiquement", () => {
    expect(readFileSync(join(SITE, "package.json"), "utf8")).not.toMatch(/shenron-dbxv2/);
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/from\s+["']@aphrody\/shenron-dbxv2/);
      expect(text).not.toMatch(/from\s+["'](?:\.\.?\/)+packages\/dbxv2/);
    }
  });

  test("l'espace admin passe par la garde du proxy et par requireAdmin", () => {
    const page = readFileSync(join(SRC, "app/admin/dbxv2/page.tsx"), "utf8");
    const actions = readFileSync(join(SRC, "app/admin/dbxv2/_actions.ts"), "utf8");
    expect(page).toContain("requireAdmin()");
    expect(actions.match(/requireAdmin\(\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(readFileSync(join(SRC, "proxy.ts"), "utf8")).toContain('pathname.startsWith("/admin/")');
  });

  test("le relais des médias est fermé sans porte ouverte ni session admin", () => {
    const relay = readFileSync(join(SRC, "app/admin/dbxv2/media/[...path]/route.ts"), "utf8");
    expect(relay).toContain("dbxv2SiteGate().enabled");
    expect(relay).toContain("isCurrentUserAdmin()");
    expect(relay).toContain("status: 404");
  });
});

describe("garde de build", () => {
  const next = join(SITE, ".next");
  test.skipIf(!existsSync(next))("la sortie Next ne contient ni module privé ni secret", () => {
    expect(findDbxv2Leaks(next)).toEqual([]);
    const statics = join(next, "static");
    const bad: string[] = [];
    const scan = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (/\.(?:js|html|json)$/.test(entry.name) && statSync(full).size < 16e6) {
          const text = readFileSync(full, "utf8");
          if (/DBXV2_TOKEN|DBXV2_SERVER_URL|\/r\/(?:png|wav|video|model\.glb)\//.test(text))
            bad.push(relative(next, full));
        }
      }
    };
    if (existsSync(statics)) scan(statics);
    expect(bad).toEqual([]);
  });
});
