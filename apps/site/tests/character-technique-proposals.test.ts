// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  proposeCharacterTechniqueLinks,
  readCharacterTechniqueSnapshots,
  type CharacterTechniqueSnapshots,
} from "../scripts/propose-character-technique-links";

const reference = {
  kind: "manga-scan",
  continuity: "manga",
  chapter: 285,
  url: "https://dragonballfr.com/wiki/manga/1443?page=47",
  title: "Dragon Ball, chapter 285",
  locator: "Volume 24, page 47",
  attests: "character-uses-technique",
  reviewed: true,
};
const entry = {
  characterId: 1,
  techniqueId: 160,
  expectedCharacterName: "Son Goku",
  expectedTechniqueName: "Kaioken",
  expectedTechniqueType: "amplification",
  references: [reference],
  dependentVariantIds: [2110, 2118, 2124],
};
const snapshots = (): CharacterTechniqueSnapshots => ({
  origin: "https://dragonballfr.com",
  observedAt: "2026-10-25T18:00:00Z",
  characters: { 1: { id: 1, name: "Son Goku", visible: true } },
  techniques: {
    160: { id: 160, name: "Kaioken", type: "amplification", creatorId: 63, visible: true },
  },
  relations: { 1: { rows: [{ characterId: 1, techniqueId: 327 }], total: 1 } },
});

describe("canonical character-technique proposals", () => {
  test("proposes the exact missing canonical link and preserves creator attribution", () => {
    const source = snapshots();
    const report = proposeCharacterTechniqueLinks({ candidates: [entry] }, source);
    expect(report.productionWrites).toBe(0);
    expect(report.proposals[0]!.request).toEqual({
      method: "POST",
      url: "https://dragonballfr.com/api/wiki-admin/db_character_techniques",
      body: { characterId: 1, techniqueId: 160 },
    });
    expect(
      report.proposals[0]!.dependentVariants.every(
        (v) => v.status === "blocked-until-relationship-created-and-read-back",
      ),
    ).toBe(true);
    expect(source.techniques[160]!.creatorId).toBe(63);
    expect(report.proposals[0]!.snapshots.characterSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  test("does not propose a repeated relation or conflate it with a game move", () => {
    const source = snapshots();
    source.relations[1]!.rows.push({ characterId: 1, techniqueId: 160 });
    source.relations[1]!.total++;
    expect(
      proposeCharacterTechniqueLinks({ candidates: [entry] }, source).proposals[0]!.status,
    ).toBe("already-linked");
    expect(
      proposeCharacterTechniqueLinks({ candidates: [entry] }, source).proposals[0]!.request,
    ).toBeNull();
    source.techniques[327] = { id: 327, name: "Attaque Kaioken", type: "super", visible: true };
    const game = proposeCharacterTechniqueLinks(
      {
        candidates: [
          {
            ...entry,
            techniqueId: 327,
            expectedTechniqueName: "Attaque Kaioken",
            expectedTechniqueType: "super",
          },
        ],
      },
      source,
    ).proposals[0]!;
    expect(game.status).toBe("blocked");
    expect(game.blockers).toContain("game_skill_identity_requires_separate_review");
  });
  test("blocks identity drift, hidden rows, incomplete relations and duplicate candidates", () => {
    const source = snapshots();
    source.characters[1]!.visible = false;
    source.techniques[160]!.name = "Different identity";
    source.relations[1]!.total = 2;
    const report = proposeCharacterTechniqueLinks({ candidates: [entry, entry] }, source);
    expect(report.proposals[0]!.blockers).toEqual([
      "character_identity_or_visibility_drifted",
      "technique_identity_type_or_visibility_drifted",
      "complete_character_relations_snapshot_required",
    ]);
    expect(report.proposals[1]!.blockers).toContain("duplicate_candidate");
    expect(report.proposals.every((item) => item.request === null)).toBe(true);
  });
  test("requires reviewed primary manga evidence rather than game text or name similarity", () => {
    for (const changed of [
      { ...reference, reviewed: false },
      { ...reference, kind: "game" },
      { ...reference, continuity: "game" },
      { ...reference, attests: "similar-name" },
      { ...reference, url: "https://dragonball.fandom.com/wiki/Kaioken" },
      { ...reference, url: "https://private:secret@dragonballfr.com/wiki/manga/1443" },
      { ...reference, url: "http://dragonballfr.com/wiki/manga/1443" },
    ])
      expect(() =>
        proposeCharacterTechniqueLinks(
          { candidates: [{ ...entry, references: [changed] }] },
          snapshots(),
        ),
      ).toThrow();
  });
});

describe("official administrative snapshot reads", () => {
  test("uses only GET on the fixed origin and never serializes the credential into reports", async () => {
    const credential = "fixture-sensitive-credential";
    const paths: string[] = [];
    const fake = Object.assign(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(String(input));
        paths.push(url.pathname);
        expect(url.origin).toBe("https://dragonballfr.com");
        expect(init?.method).toBe("GET");
        expect(init?.redirect).toBe("error");
        expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${credential}`);
        if (url.pathname.endsWith("db_characters/1"))
          return Response.json(snapshots().characters[1]);
        if (url.pathname.endsWith("db_techniques/160"))
          return Response.json(snapshots().techniques[160]);
        return Response.json(snapshots().relations[1]);
      },
      { preconnect: fetch.preconnect },
    );
    const source = await readCharacterTechniqueSnapshots({ candidates: [entry] }, credential, fake);
    const report = proposeCharacterTechniqueLinks({ candidates: [entry] }, source);
    expect(paths).toHaveLength(3);
    expect(JSON.stringify(report)).not.toContain(credential);
    expect(report.proposals[0]!.status).toBe("proposed-not-executed");
  });
  test("refuses missing credentials, failed responses and partial child lists", async () => {
    const unavailable = Object.assign(async () => new Response(null, { status: 503 }), {
      preconnect: fetch.preconnect,
    });
    await expect(
      readCharacterTechniqueSnapshots({ candidates: [entry] }, "", unavailable),
    ).rejects.toThrow("credential unavailable");
    await expect(
      readCharacterTechniqueSnapshots({ candidates: [entry] }, "fixture", unavailable),
    ).rejects.toThrow("HTTP 503");
    const partial = Object.assign(
      async (input: Parameters<typeof fetch>[0]) =>
        String(input).includes("db_characters")
          ? Response.json(snapshots().characters[1])
          : Response.json({ rows: [], total: 1 }),
      { preconnect: fetch.preconnect },
    );
    await expect(
      readCharacterTechniqueSnapshots({ candidates: [entry] }, "fixture", partial),
    ).rejects.toThrow("Incomplete");
  });
});
