/**
 * Paquet portable du plugin (Gemini, Drive, entraînement) : contenu public,
 * archive ZIP lisible, fichier unique complet, corpus exploitable.
 */
import { describe, expect, test } from "bun:test";
import { inflateRawSync } from "node:zlib";
import { corpus, fichierUnique, fichiersDuPaquet, zip, type Fichier } from "./pack";

/** Lecteur ZIP minimal : répertoire central, puis chaque entrée décompressée. */
function lireZip(octets: Uint8Array): Map<string, Uint8Array> {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const fin = octets.length - 22;
  expect(vue.getUint32(fin, true)).toBe(0x06054b50);
  const total = vue.getUint16(fin + 10, true);
  let p = vue.getUint32(fin + 16, true);
  const sortie = new Map<string, Uint8Array>();
  for (let i = 0; i < total; i++) {
    expect(vue.getUint32(p, true)).toBe(0x02014b50);
    const crc = vue.getUint32(p + 16, true);
    const taille = vue.getUint32(p + 20, true);
    const longueurNom = vue.getUint16(p + 28, true);
    const local = vue.getUint32(p + 42, true);
    const nom = new TextDecoder().decode(octets.subarray(p + 46, p + 46 + longueurNom));
    const debut = local + 30 + vue.getUint16(local + 26, true) + vue.getUint16(local + 28, true);
    const contenu = new Uint8Array(inflateRawSync(octets.subarray(debut, debut + taille)));
    expect(Bun.hash.crc32(contenu)).toBe(crc);
    sortie.set(nom, contenu);
    p += 46 + longueurNom;
  }
  return sortie;
}

describe("paquet portable du plugin", () => {
  let fichiers: Fichier[] = [];

  test("contient le plugin, l'agent home public et les SVG, rien de privé", async () => {
    fichiers = await fichiersDuPaquet();
    const chemins = fichiers.map((f) => f.chemin);
    for (const attendu of [
      "shenron-plugin/GEMINI.md",
      "shenron-plugin/skills/dragon-ball-canon/references/doctrine.md",
      "shenron-plugin/agent-home/SOUL.md",
      "shenron-plugin/assets/kinto-un.svg",
      "shenron-plugin/assets/dragon-ball-4-etoiles.svg",
    ]) {
      expect(chemins).toContain(attendu);
    }
    expect(chemins.filter((c) => /\.env|data\/home|MEMORY\.md|\.(db|sqlite3?)$/.test(c))).toEqual(
      [],
    );
  });

  test("l'archive ZIP se relit à l'identique", () => {
    const relu = lireZip(zip(fichiers));
    expect([...relu.keys()]).toEqual(fichiers.map((f) => f.chemin));
    for (const f of fichiers) expect(relu.get(f.chemin)).toEqual(f.contenu);
  });

  test("le fichier unique reprend chaque page et les déclarations d'auteur", () => {
    const unique = fichierUnique(fichiers);
    for (const f of fichiers.filter((x) => x.chemin.endsWith(".md"))) {
      expect(unique).toContain(`# Fichier : ${f.chemin.slice("shenron-plugin/".length)}`);
    }
    expect(unique.indexOf("# Fichier : GEMINI.md")).toBeLessThan(
      unique.indexOf("# Fichier : skills/"),
    );
    expect(unique).toContain("déclarations d'auteur intégrales");
  });

  test("le corpus d'entraînement a des morceaux identifiés, sourcés et assez longs", () => {
    const morceaux = corpus(fichiers);
    expect(morceaux.length).toBeGreaterThan(100);
    expect(new Set(morceaux.map((m) => m.id)).size).toBe(morceaux.length);
    for (const m of morceaux) {
      expect(m.text.length).toBeGreaterThanOrEqual(30);
      expect(m.text.length).toBeLessThanOrEqual(2600);
      expect(m.doc_id && m.source_path && m.title).toBeTruthy();
    }
    expect(morceaux.some((m) => m.source_path === "agent-home/SOUL.md")).toBe(true);
    expect(
      morceaux.some((m) => m.url?.startsWith("https://dragonballfr.com/wiki/databooks/")),
    ).toBe(true);
  });
});
