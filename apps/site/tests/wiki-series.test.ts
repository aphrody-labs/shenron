import { describe, expect, test } from "bun:test";
import { seriesFromLabel, seriesFromLabels } from "../src/lib/wiki-series";

describe("wiki series labels", () => {
  test("distinguishes Daima, GT, Super, Z and the original series", () => {
    expect(seriesFromLabel("Dragon Ball Z — Saga Buu")).toBe("DBZ");
    expect(seriesFromLabel("Tournoi du Pouvoir — Survie de l'Univers")).toBe("DBS");
    expect(seriesFromLabel("Dragon Ball Super")).toBe("DBS");
    expect(seriesFromLabel("Dragon Ball Daima")).toBe("DB_DAIMA");
    expect(seriesFromLabel("Dragon Ball GT")).toBe("DBGT");
    expect(seriesFromLabel("Dragon Ball")).toBe("DB");
    expect(seriesFromLabel("Époque indéterminée")).toBeNull();
  });

  test("keeps unclassified records out of a guessed continuity", () => {
    expect(seriesFromLabels("Récit spécial")).toBe("UNKNOWN");
    expect(seriesFromLabels("Récit spécial", "Dragon Ball Z")).toBe("DBZ");
  });
});
