import { describe, expect, test } from "bun:test";
import { clampTitle, TITLE_MAX } from "@/lib/seo-title";

const full = (t: string) => `${t} — DBFR`;

describe("clampTitle", () => {
  test("laisse intact un titre court", () => {
    expect(clampTitle("Son Goku", " — Personnage Dragon Ball")).toBe(
      "Son Goku — Personnage Dragon Ball",
    );
  });

  test("tronque la tete et garde la serie, 70 caracteres au plus avec le gabarit", () => {
    const t = clampTitle(
      "Épisode 11 : Le Sacre du champion des juniors ! Qui se battra contre Satan ?",
      " — Dragon Ball Z Kai – Final Chapters",
    );
    expect(full(t).length).toBeLessThanOrEqual(TITLE_MAX);
    expect(t.endsWith(" — Dragon Ball Z Kai – Final Chapters")).toBe(true);
    expect(t).toContain("…");
  });

  test("sacrifie le suffixe s'il ne laisse pas de place a la tete", () => {
    const t = clampTitle("Un titre assez long pour poser probleme ici", ` — ${"x".repeat(60)}`);
    expect(full(t).length).toBeLessThanOrEqual(TITLE_MAX);
  });

  test("tronque sans mot coupe ni ponctuation pendante", () => {
    const t = clampTitle(
      "Chapitre 167 — Un Tenkaichi Budokai plein de surprises",
      " — Manga Dragon Ball",
    );
    expect(full(t).length).toBeLessThanOrEqual(TITLE_MAX);
    expect(t).not.toMatch(/[ \-—,:]…/u);
  });
});
