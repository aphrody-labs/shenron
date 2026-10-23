import "./setup";
import { describe, expect, test } from "bun:test";

import {
  ANILIST_MEDIA,
  ANILIST_PAGE_SIZE,
  EMPTY_INDEX,
  ENRICHMENT_MIN_AGE_MS,
  enrichmentGate,
  fetchAnilistChars,
  indexAnilist,
  NAME_OVERRIDES,
  normalizeName,
  PLANET_OVERRIDES,
  planCharacterEnrichment,
  planPlanetEnrichment,
  type AnilistChar,
  type NamedRow,
} from "../src/db/anilist-enrichment";

const ani = (full: string, native: string | null, userPreferred = full): AnilistChar => ({
  name: { full, native, userPreferred },
});
const row = (
  id: number,
  name: string,
  nameJa: string | null = null,
  nameRomaji: string | null = null,
): NamedRow => ({ id, name, nameJa, nameRomaji });

describe("media list", () => {
  test("no longer holds 21893, which AniList resolves to a Gundam film", () => {
    const ids = ANILIST_MEDIA.map((media) => media.id);
    expect(ids).not.toContain(21893);
    expect(ids).toContain(21175); // Dragon Ball Super
    expect(new Set(ids).size).toBe(ids.length);
    expect(ANILIST_MEDIA.every((media) => media.pages >= 1)).toBe(true);
  });

  test("the explicit overrides survived the move", () => {
    expect(NAME_OVERRIDES.goku).toEqual({ ja: "孫悟空", romaji: "Son Gokuu" });
    expect(PLANET_OVERRIDES.namek?.ja).toBe("ナメック星");
    expect(Object.keys(NAME_OVERRIDES).length).toBe(48);
  });
});

describe("planning", () => {
  const index = indexAnilist([
    ani("Gokuu Son", "孫悟空"),
    ani("Dabura", "ダーブラ"),
    ani("Metal Cooler", "メタルクウラ"),
  ]);

  test("counts every row exactly once: updated, already complete, unmatched", () => {
    const rows = [
      row(1, "Metal Cooler"), // found by name
      row(2, "Vegeta", "ベジータ", "Bejiita"), // complete
      row(3, "Personnage inconnu"), // nothing anywhere
    ];
    const plan = planCharacterEnrichment(rows, {}, index);
    expect(plan.updates).toEqual([{ id: 1, nameJa: "メタルクウラ", nameRomaji: "Metal Cooler" }]);
    expect(plan.alreadyComplete).toBe(1);
    expect(plan.unmatched).toBe(1);
    expect(plan.updates.length + plan.alreadyComplete + plan.unmatched).toBe(rows.length);
  });

  test("the word order of the wiki name does not matter", () => {
    const plan = planCharacterEnrichment([row(1, "Son Gokuu")], {}, index);
    expect(plan.updates).toEqual([{ id: 1, nameJa: "孫悟空", nameRomaji: "Gokuu Son" }]);
  });

  test("a row with its Japanese name but no romaji is found through that name", () => {
    // The shape of ~320 production rows (Dabra: ダーブラ, no romaji).
    const plan = planCharacterEnrichment([row(117, "Dabra", "ダーブラ")], {}, index);
    expect(plan.updates).toEqual([{ id: 117, nameJa: "ダーブラ", nameRomaji: "Dabura" }]);
  });

  test("a name already stored is never replaced, only the gap is filled", () => {
    const plan = planCharacterEnrichment(
      [row(1, "Metal Cooler", "メタルクウラ（編集済み）")],
      {},
      index,
    );
    expect(plan.updates).toEqual([
      { id: 1, nameJa: "メタルクウラ（編集済み）", nameRomaji: "Metal Cooler" },
    ]);
    const overridden = planCharacterEnrichment(
      [row(2, "Goku", "孫悟空（確認済み）")],
      NAME_OVERRIDES,
      EMPTY_INDEX,
    );
    expect(overridden.updates).toEqual([
      { id: 2, nameJa: "孫悟空（確認済み）", nameRomaji: "Son Gokuu" },
    ]);
  });

  test("explicit overrides win over AniList", () => {
    const wrong = indexAnilist([ani("Freezer", "ちがう")]);
    const plan = planCharacterEnrichment([row(1, "Freezer")], NAME_OVERRIDES, wrong);
    expect(plan.updates).toEqual([{ id: 1, nameJa: "フリーザ", nameRomaji: "Frieza" }]);
  });

  test("a row nobody can complete is reported unmatched, not as a failure", () => {
    const plan = planCharacterEnrichment([row(1, "Agent de police", "お巡りさん")], {}, index);
    expect(plan).toEqual({ updates: [], alreadyComplete: 0, unmatched: 1 });
  });

  test("planets use the overrides only", () => {
    const plan = planPlanetEnrichment(
      [row(1, "Namek"), row(2, "Planète sans graphie")],
      PLANET_OVERRIDES,
    );
    expect(plan.updates).toEqual([{ id: 1, nameJa: "ナメック星", nameRomaji: "Namekku-sei" }]);
    expect(plan.unmatched).toBe(1);
  });

  test("normalizeName folds accents and punctuation", () => {
    expect(normalizeName("Végéta-Sama!")).toBe("vegetasama");
  });
});

describe("gate", () => {
  const now = 1_800_000_000_000;

  test("a PostgreSQL-fed replica is never enriched locally", () => {
    const gate = enrichmentGate({ replicaFed: true, lastCompleteRunAt: null, now });
    expect(gate.run).toBe(false);
    expect(gate.run === false && gate.reason).toContain("PostgreSQL");
  });

  test("a complete run under a week old is not repeated; an older or absent one is", () => {
    expect(enrichmentGate({ replicaFed: false, lastCompleteRunAt: now - 1000, now }).run).toBe(
      false,
    );
    expect(
      enrichmentGate({
        replicaFed: false,
        lastCompleteRunAt: now - ENRICHMENT_MIN_AGE_MS - 1,
        now,
      }).run,
    ).toBe(true);
    expect(enrichmentGate({ replicaFed: false, lastCompleteRunAt: null, now }).run).toBe(true);
  });
});

describe("AniList fetch", () => {
  const page = (names: string[], hasNextPage: boolean) =>
    new Response(
      JSON.stringify({
        data: {
          Media: {
            characters: { pageInfo: { hasNextPage }, nodes: names.map((name) => ani(name, null)) },
          },
        },
      }),
      { status: 200 },
    );

  type Variables = { id: number; page: number; perPage: number };

  function harness(responder: (call: number, variables: Variables) => Response) {
    const calls: Variables[] = [];
    const slept: number[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const { variables } = JSON.parse(String(init.body)) as { variables: Variables };
      calls.push(variables);
      return responder(calls.length, variables);
    }) as unknown as typeof fetch;
    const deps = {
      fetch: fetchImpl,
      sleep: async (ms: number) => {
        slept.push(ms);
      },
      minIntervalMs: 2_100,
    };
    return { calls, slept, deps };
  }

  test("pages through every title, throttled, 50 at a time", async () => {
    const { calls, slept, deps } = harness((call) => page([`c${call}`], call % 2 === 1));
    const result = await fetchAnilistChars(deps);
    expect(result.truncated).toEqual([]);
    expect(calls.every((c) => c.perPage === ANILIST_PAGE_SIZE)).toBe(true);
    // Odd calls announce a next page, even calls end the title: two requests per title.
    expect(calls).toHaveLength(ANILIST_MEDIA.length * 2);
    expect(calls.slice(0, 2).map((c) => c.page)).toEqual([1, 2]);
    expect(slept.every((ms) => ms === 2_100)).toBe(true);
    expect(slept).toHaveLength(calls.length - 1);
    expect(result.chars).toHaveLength(calls.length);
  });

  test("never exceeds the page budget of a title", async () => {
    const { calls, deps } = harness(() => page(["x"], true));
    await fetchAnilistChars(deps);
    const perTitle = new Map<number, number>();
    for (const call of calls) perTitle.set(call.id, (perTitle.get(call.id) ?? 0) + 1);
    for (const media of ANILIST_MEDIA) expect(perTitle.get(media.id)).toBe(media.pages);
  });

  test("a 429 waits Retry-After and retries the same page once", async () => {
    const { calls, slept, deps } = harness((call, variables) =>
      call === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "42" } })
        : page([`c${variables.page}`], false),
    );
    const result = await fetchAnilistChars(deps);
    expect(result.truncated).toEqual([]);
    expect(calls[0]).toEqual(calls[1]!);
    expect(slept[0]).toBe(42_000);
  });

  test("a failure is reported instead of silently ending the title", async () => {
    const { deps } = harness((_call, variables) =>
      variables.id === 813 ? new Response("boom", { status: 500 }) : page(["ok"], false),
    );
    const result = await fetchAnilistChars(deps);
    expect(result.truncated).toEqual(["Dragon Ball Z page 1: HTTP 500"]);
    // The other titles were still fetched.
    expect(result.chars).toHaveLength(ANILIST_MEDIA.length - 1);
  });

  test("a GraphQL error is reported with its message", async () => {
    const { deps } = harness(
      () =>
        new Response(JSON.stringify({ errors: [{ message: "Too Many Requests." }] }), {
          status: 200,
        }),
    );
    const result = await fetchAnilistChars(deps);
    expect(result.truncated[0]).toBe("Dragon Ball page 1: Too Many Requests.");
  });
});

describe("seed-wiki wiring", () => {
  test("the mark round-trips through guild_settings", async () => {
    Bun.env.ALLOW_SQLITE_WIKI_WRITE = "1";
    const { readEnrichmentMark, writeEnrichmentMark, ENRICHMENT_MARK_KEY } =
      await import("../src/db/seed-wiki");
    const { DatabaseService } = await import("../src/db/index");
    const { sqlite } = new DatabaseService();
    expect(readEnrichmentMark(sqlite)).toBeNull();
    writeEnrichmentMark(sqlite, 1_800_000_000_000);
    writeEnrichmentMark(sqlite, 1_800_000_000_500);
    expect(readEnrichmentMark(sqlite)).toBe(1_800_000_000_500);
    expect(ENRICHMENT_MARK_KEY).toBe("wiki.anilist_enriched_at");
  });

  test("on a seeded replica fed by PostgreSQL the job says why and does not touch the network", async () => {
    Bun.env.ALLOW_SQLITE_WIKI_WRITE = "1";
    const { runWikiSeed } = await import("../src/db/seed-wiki");
    const { DatabaseService } = await import("../src/db/index");
    const { sqlite } = new DatabaseService();
    sqlite
      .query(
        "INSERT OR IGNORE INTO db_characters (id, name, image) VALUES (990001, 'Seed Probe', 'x')",
      )
      .run();
    const realFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched++;
      throw new Error("network must not be used");
    }) as unknown as typeof fetch;
    const lines: string[] = [];
    try {
      const result = await runWikiSeed({ replicaFed: true, log: (line) => lines.push(line) });
      expect(result.skipped).toBe(true);
      expect(result.enriched).toBe(0);
      expect(fetched).toBe(0);
      expect(
        lines.some(
          (line) => line.includes("enrichment AniList ignoré") && line.includes("PostgreSQL"),
        ),
      ).toBe(true);
      expect(lines.some((line) => line.includes("Fetching AniList"))).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
      sqlite.query("DELETE FROM db_characters WHERE id = 990001").run();
    }
  });
});
