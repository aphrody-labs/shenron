/**
 * Le plugin « shenron » doit marcher seul : instantanés à jour, liens internes
 * résolus, scripts sans dépôt ni réseau, aucune donnée privée.
 */
import { describe, expect, test } from "bun:test";
import { dirname, join, resolve } from "node:path";
import { RACINE, lire, verifier } from "./build-references";

const PLUGIN = join(RACINE, "plugin");

async function fichiers(motif: string): Promise<string[]> {
  return (await Array.fromAsync(new Bun.Glob(motif).scan({ cwd: PLUGIN, dot: true })))
    .map((f) => f.split("\\").join("/"))
    .toSorted();
}

describe("instantanés du plugin", () => {
  test("a committed config source reads the same from a revision and from the tree", async () => {
    const path = "packages/config/src/economy-canon.ts";
    expect(await lire(path, { check: true, depuis: "HEAD" })).toBe(
      await Bun.file(join(RACINE, path)).text(),
    );
  });
  test("aucune dérive entre le code du dépôt et plugin/", async () => {
    expect(await verifier({ check: true, depuis: null })).toEqual([]);
  }, 60_000);
});

describe("autonomie du plugin", () => {
  test("chaque lien relatif des pages Markdown pointe vers un fichier de plugin/", async () => {
    const morts: string[] = [];
    for (const page of await fichiers("**/*.md")) {
      const texte = await Bun.file(join(PLUGIN, page)).text();
      for (const [, cible] of texte.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:|#)/.test(cible!)) continue;
        const chemin = resolve(dirname(join(PLUGIN, page)), cible!.split("#")[0]!);
        if (!chemin.startsWith(PLUGIN) || !(await Bun.file(chemin).exists())) {
          morts.push(`${page} → ${cible}`);
        }
      }
    }
    expect(morts).toEqual([]);
  });

  test("les scripts n'importent que des modules voisins ou intégrés et n'appellent pas le réseau", async () => {
    const fautes: string[] = [];
    for (const script of await fichiers("**/*.{ts,js}")) {
      const texte = await Bun.file(join(PLUGIN, script)).text();
      for (const [, specifiant] of texte.matchAll(
        /(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s+["']([^"']+)["']/g,
      )) {
        if (
          !/^(\.\.?\/|node:|bun(:|$))/.test(specifiant!) &&
          !/^(path|fs|os|zlib|url)$/.test(specifiant!)
        ) {
          fautes.push(`${script} importe ${specifiant}`);
        }
        if (/(apps|packages|docs)\//.test(specifiant!))
          fautes.push(`${script} importe le dépôt : ${specifiant}`);
      }
      if (/\bfetch\(|node:https?|\bWebSocket\b|XMLHttpRequest|Bun\.connect/.test(texte)) {
        fautes.push(`${script} appelle le réseau`);
      }
    }
    expect(fautes).toEqual([]);
  });

  test("aucune donnée privée ni chemin d'hôte", async () => {
    const tous = await fichiers("**/*");
    expect(tous.filter((f) => /(^|\/)\.env|\.(db|sqlite3?|pem|key)$|data\/home/.test(f))).toEqual(
      [],
    );
    const fautes: string[] = [];
    for (const f of tous) {
      const texte = await Bun.file(join(PLUGIN, f)).text();
      if (/\/home\/[a-z]|DATABASE_URL=\S|(?:TOKEN|SECRET)=\S/.test(texte)) fautes.push(f);
    }
    expect(fautes).toEqual([]);
  });

  test("source-of-truth.json déclare toutes les pages et une preuve présente", async () => {
    const decl = (await Bun.file(join(PLUGIN, "source-of-truth.json")).json()) as {
      version: number;
      sources: { root: string; evidence: string[] }[];
      knowledge: string[];
    };
    expect(decl.version).toBe(1);
    for (const s of decl.sources) {
      for (const e of s.evidence)
        expect(await Bun.file(join(PLUGIN, s.root, e)).exists()).toBe(true);
    }
    expect(decl.knowledge).toEqual(await fichiers("**/*.md"));
  });
});

const skill = (s: string) => join(PLUGIN, "skills", s);
const lancer = (cmd: string[], cwd: string) => {
  const r = Bun.spawnSync(["bun", ...cmd], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, sortie: r.stdout.toString(), erreur: r.stderr.toString() };
};

describe("scripts embarqués", () => {
  test("the standalone canon snapshot distinguishes GT and DAIMA", () => {
    for (const [query, id] of [
      ["Super Saiyan 4 GT", "super-saiyan-4-gt"],
      ["Super Saiyan 4 DAIMA", "super-saiyan-4-daima"],
    ]) {
      const result = JSON.parse(
        lancer(["scripts/canon.js", "--json", query!], skill("dragon-ball-canon")).sortie,
      );
      expect(result.verdict.origine).toBe("entry:" + id);
    }
  });

  test("canon.js rend le verdict d'un sujet tranché et avoue un fallback", () => {
    const broly = JSON.parse(
      lancer(["scripts/canon.js", "--json", "Broly est-il canon ?"], skill("dragon-ball-canon"))
        .sortie,
    );
    expect(broly.verdict.origine).toBe("entry:broly");
    expect(broly.statut).toBe("établi (instantané)");
    const ouvert = JSON.parse(
      lancer(
        ["scripts/canon.js", "--json", "qui gagnerait entre Yamcha et Tao ?"],
        skill("dragon-ball-canon"),
      ).sortie,
    );
    expect(ouvert.verdict.origine).toBe("fallback");
    expect(ouvert.statut).toBe("non établi");
  });

  test("lexique.js masque puis restaure sans jeton résiduel", async () => {
    const dossier = skill("dragon-ball-japonais");
    const masque = JSON.parse(
      lancer(["scripts/lexique.js", "masque", "孫悟空は界王拳を使った"], dossier).sortie,
    );
    expect(Object.keys(masque.table).length).toBe(2);
    const table = JSON.stringify(masque.table);
    const ok = lancer(
      ["scripts/lexique.js", "restaure", "Zeta001 a utilisé le Zeta002.", "--table", table],
      dossier,
    );
    expect(ok.code).toBe(0);
    expect(ok.sortie).toContain(masque.table.Zeta001);
    const perdu = lancer(
      ["scripts/lexique.js", "restaure", "Zeta009 a disparu.", "--table", table],
      dossier,
    );
    expect(perdu.code).toBe(2);
  });

  test("faits.ts trouve une technique avec sa preuve", () => {
    const r = JSON.parse(
      lancer(["scripts/faits.ts", "cherche", "かめはめ波", "--json"], skill("dragon-ball")).sortie,
    );
    const kame = r.resultats.find(
      (x: { enregistrement: { ja?: string } }) => x.enregistrement.ja === "かめはめ波",
    );
    expect(kame.enregistrement.premier_chapitre.numero).toBeGreaterThan(0);
    expect(kame.enregistrement.premier_chapitre.preuves.length).toBeGreaterThanOrEqual(2);
  });

  test("toriyama.js dessine une sphère ; mesurer.ts lit un PNG synthétique", async () => {
    const dossier = skill("toriyama-svg");
    const svg = lancer(["scripts/toriyama.js", "sphere", "4"], dossier).sortie;
    expect(svg).toStartWith("<svg");
    expect(svg.match(/<polygon/g)?.length).toBe(4);

    const { encoderPng } = await import(join(dossier, "scripts", "png.ts"));
    const { mesurer, OPTIONS_DEFAUT } = await import(join(dossier, "scripts", "mesurer.ts"));
    const L = 120;
    const H = 60;
    const pixels = new Uint8Array(L * H * 4).fill(255);
    for (let y = 10; y < 50; y++) {
      for (let x = 20; x < 100; x++) {
        const o = (y * L + x) * 4;
        pixels.set([252, 240, 58, 255], o);
      }
    }
    const png = encoderPng({ largeur: L, hauteur: H, pixels });
    const { decoderPng } = await import(join(dossier, "scripts", "png.ts"));
    const image = decoderPng(png);
    expect(image.pixels).toEqual(pixels);
    const { mesures } = mesurer(image, { ...OPTIONS_DEFAUT, teinte: [40, 70], k: 1 });
    expect(mesures.boite).toMatchObject({ largeur: 80, hauteur: 40 });
    expect(mesures.ratio).toBe(2);
    expect((mesures.palette as { hex: string }[])[0]!.hex).toBe("#FCF03A");
  });
});
