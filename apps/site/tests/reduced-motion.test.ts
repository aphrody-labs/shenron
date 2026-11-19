/**
 * Règle globale `prefers-reduced-motion: reduce`.
 *
 * Les utilitaires `animate-*` de Tailwind et de tw-animate-css n'ont pas tous
 * une garde `motion-reduce:` ; la règle globale de `globals.css` couvre ceux
 * qui n'en ont pas. Le test vérifie la règle et relève le nombre de fichiers
 * `animate-*` sans garde, sans l'imposer fichier par fichier.
 */
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

const racine = Bun.fileURLToPath(new URL("..", import.meta.url));

describe("reduced motion", () => {
  test("globals.css neutralise animations, transitions et défilement animé", async () => {
    const css = await Bun.file(`${racine}src/app/globals.css`).text();
    const blocs = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [];
    expect(blocs).toHaveLength(1);
    const bloc = blocs[0] as string;
    expect(bloc).toMatch(/\*,\s*::before,\s*::after/);
    expect(bloc).toContain("animation-duration: 0.01ms !important;");
    expect(bloc).toContain("animation-iteration-count: 1 !important;");
    expect(bloc).toContain("transition-duration: 0.01ms !important;");
    expect(bloc).toContain("scroll-behavior: auto !important;");
  });

  test("relève les fichiers animate-* sans garde, sans les imposer", async () => {
    const animee = /animate-(?:spin|pulse|bounce|ping|in|\[)/;
    const garde = /motion-reduce|motion-safe|prefers-reduced-motion/;
    let animes = 0;
    let sansGarde = 0;
    for await (const chemin of new Glob("src/**/*.tsx").scan({ cwd: racine })) {
      const source = await Bun.file(`${racine}${chemin}`).text();
      if (!animee.test(source)) continue;
      animes += 1;
      if (!garde.test(source)) sansGarde += 1;
    }
    console.info(`animate-*: ${animes} fichiers, ${sansGarde} sans garde par fichier`);
    expect(sansGarde).toBeLessThanOrEqual(animes);
  });
});
