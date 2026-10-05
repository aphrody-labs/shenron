/**
 * Mini-jeux (lot S4) — contrat du shell, commandes tactiles et repli clavier.
 *
 * Rendu statique (`renderToStaticMarkup`) : il dit ce que le serveur envoie au
 * premier affichage, téléphone comme desktop (les deux ne diffèrent que par les
 * classes de point de rupture, vérifiées ici). Les commandes elles-mêmes sont
 * des fonctions pures, testées sans DOM.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DragonBall2048 from "../src/app/jeux/2048/DragonBall2048";
import Page2048 from "../src/app/jeux/2048/page";
import JeuxPage from "../src/app/jeux/page";
import {
  SWIPE_THRESHOLD,
  directionFromKey,
  directionFromSwipe,
} from "../src/app/jeux/2048/controls";
import { nextGridIndex } from "../src/components/games/grid-nav";

const SRC = join(import.meta.dir, "..", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

/** Aucun chrome propre à la page : le shell racine fournit nav, en-tête global et pied. */
function expectNoOwnChrome(html: string) {
  expect(html).not.toContain("<main");
  expect(html).not.toContain("<nav");
  expect(html).not.toContain("<footer");
}

describe("2048 — commandes pures", () => {
  test("flèches du clavier → directions, autres touches ignorées", () => {
    expect(directionFromKey("ArrowUp")).toBe("UP");
    expect(directionFromKey("ArrowDown")).toBe("DOWN");
    expect(directionFromKey("ArrowLeft")).toBe("LEFT");
    expect(directionFromKey("ArrowRight")).toBe("RIGHT");
    expect(directionFromKey("Enter")).toBeNull();
    expect(directionFromKey("w")).toBeNull();
  });

  test("balayage : direction dominante au-delà du seuil, rien en dessous", () => {
    expect(directionFromSwipe(SWIPE_THRESHOLD + 1, 4)).toBe("RIGHT");
    expect(directionFromSwipe(-80, 20)).toBe("LEFT");
    expect(directionFromSwipe(10, 60)).toBe("DOWN");
    expect(directionFromSwipe(-5, -45)).toBe("UP");
    // Un simple toucher (ou un tremblement du doigt) ne joue aucun coup.
    expect(directionFromSwipe(12, -8)).toBeNull();
    expect(directionFromSwipe(SWIPE_THRESHOLD, 0)).toBeNull();
  });
});

describe("2048 — rendu", () => {
  const html = renderToStaticMarkup(createElement(DragonBall2048));

  test("plateau focalisable, décrit et annoncé", () => {
    expect(html).toMatch(/tabindex="0"[^>]*role="group"|role="group"[^>]*tabindex="0"/);
    expect(html).toContain('aria-label="Plateau du 2048');
    expect(html).toContain("aria-describedby=");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Ki total : 0");
    // Le balayage ne bloque le défilement que sur le plateau.
    expect(html.match(/touch-action:none/g)?.length).toBe(1);
  });

  test("quatre boutons directionnels de 48 px au moins", () => {
    for (const label of ["Vers le haut", "Vers le bas", "Vers la gauche", "Vers la droite"]) {
      const bouton = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0];
      expect(bouton).toBeDefined();
      expect(bouton).toContain("min-h-12");
      expect(bouton).toContain("min-w-12");
    }
  });

  test("le composant ne rend plus de titre de page", () => {
    expect(html).not.toContain("<h1");
  });

  test("la page : un seul h1, colonne PageShell, aucun chrome propre", () => {
    const page = renderToStaticMarkup(Page2048());
    expect(page.match(/<h1/g)?.length).toBe(1);
    expect(page).toContain("max-w-[46rem]");
    expectNoOwnChrome(page);
  });
});

describe("index /jeux", () => {
  const html = renderToStaticMarkup(JeuxPage());

  test("une colonne au téléphone, grille ensuite", () => {
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("xl:grid-cols-3");
    expectNoOwnChrome(html);
  });

  test("liens de jeu en casse normale et cibles de 44 px", () => {
    expect(html).not.toContain("JOUER");
    const liens = html.match(/<a[^>]*href="\/jeux\/[a-z0-9]+"[^>]*>/g) ?? [];
    expect(liens.length).toBe(4);
    for (const lien of liens) expect(lien).toContain("min-h-11");
  });

  test("aucune information réservée au survol", () => {
    expect(html).not.toMatch(/group-hover:opacity-100/);
  });
});

describe("morpion — navigation aux flèches", () => {
  test("déplacement case à case sans bouclage", () => {
    expect(nextGridIndex(4, "ArrowRight")).toBe(5);
    expect(nextGridIndex(5, "ArrowRight")).toBe(5);
    expect(nextGridIndex(4, "ArrowLeft")).toBe(3);
    expect(nextGridIndex(3, "ArrowLeft")).toBe(3);
    expect(nextGridIndex(4, "ArrowDown")).toBe(7);
    expect(nextGridIndex(7, "ArrowDown")).toBe(7);
    expect(nextGridIndex(4, "ArrowUp")).toBe(1);
    expect(nextGridIndex(1, "ArrowUp")).toBe(1);
  });

  test("Début et Fin vont aux bords de la ligne, le reste n'est pas capté", () => {
    expect(nextGridIndex(4, "Home")).toBe(3);
    expect(nextGridIndex(4, "End")).toBe(5);
    expect(nextGridIndex(4, "Enter")).toBeNull();
    expect(nextGridIndex(4, "Tab")).toBeNull();
  });

  test("les cases restent focalisables une fois jouées (aria-disabled, pas disabled)", () => {
    const code = readFileSync(join(SRC, "app/jeux/morpion/MorpionGame.tsx"), "utf8");
    expect(code).toContain("aria-disabled={inert}");
    expect(code).toContain("tabIndex={focusable ? 0 : -1}");
    expect(code).not.toMatch(/disabled=\{disabled \|\| !empty\}/);
  });
});

describe("contrat du shell — jeux", () => {
  const sources = files(join(SRC, "app/jeux"))
    .concat(files(join(SRC, "components/games")))
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => [f, readFileSync(f, "utf8")] as const);

  test("PageShell et PageHeader viennent de @shenron/ui", () => {
    for (const [f, code] of sources) {
      expect(`${f}: ${code.includes("@/components/PageHeader")}`).toBe(`${f}: false`);
      expect(`${f}: ${code.includes("GamePageLayout")}`).toBe(`${f}: false`);
      expect(`${f}: ${/import \{[^}]*PageShell[^}]*\} from "@\/components\/kit"/.test(code)}`).toBe(
        `${f}: false`,
      );
    }
  });

  test("aucun conteneur maison, aucune ouverture externe directe", () => {
    for (const [f, code] of sources) {
      expect(`${f}: ${/container mx-auto/.test(code)}`).toBe(`${f}: false`);
      expect(`${f}: ${code.includes("window.open")}`).toBe(`${f}: false`);
      expect(`${f}: ${code.includes('target="_blank"')}`).toBe(`${f}: false`);
    }
  });
});
