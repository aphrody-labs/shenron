import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MODEL,
  attachSectionContexts,
  FillQueue,
  candidateFor,
  codexArguments,
  codexEnvironment,
  eligibleFields,
  evidenceMatchesEntity,
  executeJob,
  inventory,
  isOfficialUrl,
  qualifyOfficialSource,
  validateDraft,
  verifiedEvidence,
  type EvidenceInput,
  type Evidence,
  type Runner,
} from "./wiki-fill-agents";

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function queue() {
  const dir = await mkdtemp(join(tmpdir(), "wiki-fill-agents-"));
  directories.push(dir);
  return { dir, db: new FillQueue(join(dir, "queue.sqlite")) };
}
const row = {
  id: 1,
  name: "Son Goku",
  slug: "son-goku",
  nameJa: "孫悟空",
  visible: true,
  description: "",
  article: "Texte déjà établi",
};
const candidate = candidateFor("db_characters", row)!;

test("section discovery resolves visible parent names without modifying the CAS row", () => {
  const section = candidateFor("db_wiki_sections", {
    id: 9,
    entityType: "character",
    entityId: 1,
    key: "histoire",
    label: "Histoire",
    body: null,
    visible: true,
  })!;
  const before = JSON.stringify(section.snapshot);
  const [resolved] = attachSectionContexts([
    section,
    {
      ...candidate,
      snapshot: { ...candidate.snapshot, streamHeaders: { Authorization: "private-token" } },
    },
  ]);
  expect(resolved!.snapshot).toBe(section.snapshot);
  expect(JSON.stringify(resolved!.snapshot)).toBe(before);
  expect(resolved!.sha256).toBe(section.sha256);
  expect(resolved!.title).toBe("9");
  expect(resolved!.discoveryContext?.parent.identity.nameJa).toBe("孫悟空");
  expect(resolved!.discoveryContext?.section.label).toBe("Histoire");
  expect(resolved!.discoveryContext?.parent.expectedSha256).toBe(candidate.sha256);
  expect(resolved!.discoveryContext?.parent.apiPath).toBe("/api/wiki-admin/db_characters/1");
  expect(JSON.stringify(resolved!.discoveryContext)).not.toContain("private-token");
  expect(attachSectionContexts([section])[0]!.discoveryContext).toBeUndefined();
  const official = {
    ...evidence[0]!,
    kind: "official" as const,
    identityQuote: "孫悟空 is the subject of this official character notice.",
  };
  expect(evidenceMatchesEntity(resolved!, official)).toBe(true);
  expect(
    evidenceMatchesEntity(resolved!, {
      ...official,
      identityQuote: "Vegeta is another character.",
    }),
  ).toBe(false);
  expect(evidenceMatchesEntity(section, official)).toBe(false);
});

test("official Carddass anime routes cannot admit game cards or arbitrary subdomains", () => {
  expect(isOfficialUrl("https://www.carddass.com/dbh/sdbh_bm/anime/movie.php")).toBe(true);
  expect(isOfficialUrl("https://www.carddass.com/dbh/sdbh/prison_planet/")).toBe(true);
  expect(isOfficialUrl("https://www.carddass.com/dbh/sdbh_bm/cardlist/")).toBe(false);
  expect(isOfficialUrl("https://sec.carddass.com/dbh/sdbh_bm/anime/")).toBe(false);
  expect(isOfficialUrl("https://www.carddass.com/dbh/sdbh_bm/anime/../../cardlist/")).toBe(false);
  expect(isOfficialUrl("http://www.carddass.com/dbh/sdbh_bm/anime/")).toBe(false);
});
const source = {
  kind: "manga" as const,
  locator: { series: "DB", volume: "1", page: 1 },
  document: "Primary test fixture",
  sourceUrl: "https://dragonballfr.com/wiki/manga/volume/1",
  text: "Son Goku rencontre Bulma.",
  verified: true,
};
const input: EvidenceInput = {
  records: [source],
  attestations: [
    {
      textSha256: new Bun.CryptoHasher("sha256").update(source.text).digest("hex"),
      method: "human_transcription_review",
      checkedBy: "fixture-reviewer",
      checkedAt: "2026-10-15T00:00:00Z",
    },
  ],
};
const evidence = verifiedEvidence(candidate, input);
const draft = {
  decision: "propose" as const,
  changes: [
    {
      field: "description",
      value: "Son Goku rencontre Bulma.",
      claims: [
        {
          evidenceId: evidence[0]!.id,
          quote: "Son Goku rencontre Bulma.",
          text: "Rencontre avec Bulma",
        },
      ],
    },
  ],
  reason: "Supported fixture",
};
const successfulRunner: Runner = async (role) =>
  role === "writer" ? draft : { decision: "approve", reason: "Every assertion is supported" };

test("only explicitly visible empty prose or exact placeholders qualify", () => {
  expect(eligibleFields("db_characters", row)).toEqual(["description"]);
  expect(eligibleFields("db_characters", { ...row, description: "TODO" })).toEqual(["description"]);
  expect(eligibleFields("db_characters", { ...row, visible: false })).toEqual([]);
  expect(candidateFor("db_characters", { ...row, visible: false })).toBeNull();
  expect(eligibleFields("db_characters", { ...row, visible: undefined })).toEqual([]);
  expect(
    eligibleFields("db_characters", { ...row, description: "Description courte valide" }),
  ).toEqual([]);
  expect(candidate.sha256).toHaveLength(64);
});
test("OCR flags and Fandom never substitute for reviewed primary evidence", () => {
  expect(verifiedEvidence(candidate, { records: [source], attestations: [] })).toEqual([]);
  expect(
    verifiedEvidence(candidate, { ...input, records: [{ ...source, verified: false }] }),
  ).toEqual([]);
  expect(
    verifiedEvidence(candidate, {
      ...input,
      records: [{ ...source, sourceUrl: "https://dragonball.fandom.com/a" }],
    }),
  ).toEqual([]);
  expect(evidence).toHaveLength(1);
});
test("a reviewed nonempty placeholder requires the exact field hash and never exposes hidden rows", () => {
  const review = {
    table: "db_characters",
    id: "1",
    field: "article",
    valueSha256: new Bun.CryptoHasher("sha256").update(row.article).digest("hex"),
    reviewedBy: "fixture-owner",
    reason: "explicit-editorial-placeholder" as const,
  };
  expect(candidateFor("db_characters", row, [review])!.fields).toEqual(["description", "article"]);
  expect(
    candidateFor("db_characters", { ...row, article: "Changed by another editor" }, [review])!
      .fields,
  ).toEqual(["description"]);
  expect(candidateFor("db_characters", { ...row, visible: false }, [review])).toBeNull();
});
test("strict model output cannot overwrite existing fields, visibility or unsupported claims", () => {
  expect(validateDraft(draft, candidate, evidence)).toEqual(draft);
  for (const field of ["article", "visible", "id"])
    expect(() =>
      validateDraft({ ...draft, changes: [{ ...draft.changes[0], field }] }, candidate, evidence),
    ).toThrow();
  expect(() => validateDraft({ ...draft, injected: true }, candidate, evidence)).toThrow();
  expect(() =>
    validateDraft(
      {
        ...draft,
        changes: [
          {
            ...draft.changes[0],
            claims: [{ evidenceId: "invented", quote: "Son Goku", text: "claim" }],
          },
        ],
      },
      candidate,
      evidence,
    ),
  ).toThrow();
  expect(() => validateDraft({ ...draft, decision: "abstain" }, candidate, evidence)).toThrow();
});
test("one game quotation cannot qualify two different anime episodes", () => {
  const shared: Evidence = {
    ...evidence[0]!,
    kind: "official",
    document: "Big Bang Mission 11 game cards",
    sourceUrl: "https://dragon-ball-official.com/news/01_661.html",
    excerpt: "プロモーションアニメ最新話で爆誕したゴジータ:ゼノ",
    identityQuote: "プロモーションアニメ最新話で爆誕したゴジータ:ゼノ",
  };
  for (const [id, title] of [
    [854, "【SDBH★BM11話】宇宙創成のゆくえ 新たなる世界の誕生！"],
    [847, "【SDBH★新時空大戦編7話】立ちはだかるフューの脅威！奇跡の最強コンビ誕生！"],
  ] as const) {
    const episode = candidateFor("db_episodes", {
      id,
      title,
      series: "SDBH",
      visible: true,
      synopsis: null,
    })!;
    expect(evidenceMatchesEntity(episode, shared)).toBe(false);
    expect(() =>
      validateDraft(
        {
          ...draft,
          changes: [
            {
              field: "synopsis",
              value: "Gogeta apparaît.",
              claims: [{ evidenceId: shared.id, quote: shared.excerpt, text: "Apparition" }],
            },
          ],
        },
        episode,
        [shared],
      ),
    ).toThrow("identity");
  }
});
test("episode evidence needs its exact title, numbered arc and anime medium in the fact passage", () => {
  const episode = candidateFor("db_episodes", {
    id: 1,
    title: "【SDBH★BM11話】宇宙創成のゆくえ",
    series: "SDBH",
    visible: true,
    synopsis: null,
  })!;
  const linked: Evidence = {
    ...evidence[0]!,
    kind: "official",
    excerpt: "悟空とベジータが戦う。",
    identityQuote: "プロモーションアニメBM第11話「宇宙創成のゆくえ」。悟空とベジータが戦う。",
  };
  expect(evidenceMatchesEntity(episode, linked)).toBe(true);
  expect(
    evidenceMatchesEntity(episode, {
      ...linked,
      identityQuote: linked.identityQuote!.replace("第11話", "第111話"),
    }),
  ).toBe(false);
  expect(
    evidenceMatchesEntity(episode, {
      ...linked,
      identityQuote: linked.identityQuote!.replace("BM", "別の編"),
    }),
  ).toBe(false);
  expect(
    evidenceMatchesEntity(episode, { ...linked, excerpt: "A different unrelated scene" }),
  ).toBe(false);
});
test("an exhibition is not a book and a different ISBN is not the same edition", () => {
  const book = candidateFor("db_databooks", {
    id: 40,
    title: "Akira Toriyama The World",
    titleJa: "鳥山明 THE WORLD",
    isbn: null,
    visible: true,
    description: null,
  })!;
  const official: Evidence = {
    ...evidence[0]!,
    kind: "official",
    document: "鳥山明 THE WORLD/鳥山 明 | 集英社",
    sourceUrl: "https://books.shueisha.co.jp/items/contents.html?isbn=4-08-858130-X",
  };
  expect(evidenceMatchesEntity(book, official)).toBe(true);
  expect(
    evidenceMatchesEntity(book, {
      ...official,
      sourceUrl: "https://dragon-ball-official.com/news/exhibition.html",
    }),
  ).toBe(false);
  expect(
    evidenceMatchesEntity(
      { ...book, snapshot: { ...book.snapshot, isbn: "978-4-08-000000-0" } },
      official,
    ),
  ).toBe(false);
  expect(() =>
    validateDraft(
      {
        ...draft,
        changes: [{ ...draft.changes[0], value: "Dans le dernier épisode, Goku rencontre Bulma." }],
      },
      candidate,
      evidence,
    ),
  ).toThrow("as-of");
});
test("publisher registry binds the same ISBN in its route and verified body", async () => {
  const book = candidateFor("db_databooks", {
    id: 16,
    title: "Dragon Ball Chozenshu 1",
    titleJa: "ドラゴンボール超全集 1",
    isbn: "978-4-08-782496-4",
    visible: true,
    description: null,
  })!;
  const url = "https://www.books.or.jp/book-details/9784087824964";
  const quote = "『ドラゴンボール大全集』に新情報を追加してリニューアル!";
  const identityQuote = `ドラゴンボール超全集 1 内容紹介 ${quote} ISBN：9784087824964 出版社：集英社`;
  const qualified = await qualifyOfficialSource(
    { url, title: "ドラゴンボール超全集 1", quote, identityQuote },
    async () =>
      new Response(`<title>ドラゴンボール超全集 1</title><p>${identityQuote}</p>`, {
        headers: { "content-type": "text/html" },
      }),
  );
  expect(qualified.evidence.document).toContain("JPO/JPRO Books publisher registry");
  expect(evidenceMatchesEntity(book, qualified.evidence)).toBe(true);
  expect(
    evidenceMatchesEntity(
      { ...book, snapshot: { ...book.snapshot, isbn: "9784087824971" } },
      qualified.evidence,
    ),
  ).toBe(false);
  expect(
    evidenceMatchesEntity(book, {
      ...qualified.evidence,
      sourceUrl: url.replace("9784087824964", "9784087824971"),
    }),
  ).toBe(false);
  expect(
    evidenceMatchesEntity(book, {
      ...qualified.evidence,
      identityQuote: identityQuote.replace("9784087824964", "9784087824971"),
    }),
  ).toBe(false);
  expect(
    isOfficialUrl("https://www.books.or.jp/book-details/9784087824964?isbn=9784087824971"),
  ).toBe(false);
  expect(isOfficialUrl("https://www.books.or.jp/search?isbn=9784087824964")).toBe(false);
  expect(isOfficialUrl("https://unknown.books.or.jp/book-details/9784087824964")).toBe(false);
});

test("persistent queue resumes leases, deduplicates snapshots and bounds failures", async () => {
  const { dir, db } = await queue();
  const key = db.enqueue(candidate, evidence, DEFAULT_MODEL);
  expect(db.enqueue(candidate, evidence, DEFAULT_MODEL)).toBe(key);
  const first = db.claim("crashed", 10000)!;
  expect(db.claim("second", 10000)).toBeNull();
  db.db.query("UPDATE jobs SET lease_until=0 WHERE key=?").run(key);
  db.close();
  const resumed = new FillQueue(join(dir, "queue.sqlite"));
  try {
    const second = resumed.claim("resumed", 10000)!;
    expect(second.attempts).toBe(first.attempts + 1);
    await executeJob(resumed, second, "resumed", async () => {
      throw new Error("bounded failure");
    });
    const third = resumed.claim("last", 10000)!;
    expect(third.attempts).toBe(3);
    expect(
      await executeJob(resumed, third, "last", async () => {
        throw new Error("bounded failure");
      }),
    ).toBe("failed");
    expect(resumed.claim("fourth", 10000)).toBeNull();
  } finally {
    resumed.close();
  }
});

test("a revised proposal preserves the previous quarantine and independent audit", async () => {
  const { db } = await queue();
  try {
    const original = db.enqueue(candidate, evidence, DEFAULT_MODEL, "original-contract");
    db.db
      .query(
        "UPDATE jobs SET status='quarantined',error='root-review: actor-ambiguity',draft=?,review=? WHERE key=?",
      )
      .run('{"decision":"propose"}', '{"decision":"approve"}', original);
    const revised = db.enqueue(candidate, evidence, DEFAULT_MODEL, "literal-actor-contract");
    expect(revised).not.toBe(original);
    expect(
      db.db.query("SELECT status,error,draft,review FROM jobs WHERE key=?").get(original),
    ).toEqual({
      status: "quarantined",
      error: "root-review: actor-ambiguity",
      draft: '{"decision":"propose"}',
      review: '{"decision":"approve"}',
    });
    expect(db.claim("new-owner", 10000)!.key).toBe(revised);
  } finally {
    db.close();
  }
});
test("real queue executes independent writer/reviewer and never reruns an approved snapshot", async () => {
  const { db } = await queue();
  try {
    db.enqueue(candidate, evidence, DEFAULT_MODEL);
    const roles: string[] = [];
    const job = db.claim("owner", 10000)!;
    expect(
      await executeJob(db, job, "owner", async (...args) => {
        roles.push(args[0]);
        return successfulRunner(...args);
      }),
    ).toBe("approved");
    expect(roles).toEqual(["writer", "reviewer"]);
    expect(db.claim("again", 10000)).toBeNull();
    expect(db.summary()).toEqual([{ status: "approved", count: 1 }]);
    const next = candidateFor("db_characters", { ...row, article: "A newer article" })!;
    db.enqueue(next, evidence, DEFAULT_MODEL);
    expect(db.claim("new", 10000)!.key).not.toBe(job.key);
  } finally {
    db.close();
  }
});
test("missing evidence requires discovery and a rejecting reviewer quarantines proposals", async () => {
  const { db } = await queue();
  try {
    db.enqueue(candidate, [], DEFAULT_MODEL);
    const discoveryJob = db.claim("discover", 10000)!;
    const discoveryRoles: string[] = [];
    expect(
      await executeJob(db, discoveryJob, "discover", async (role) => {
        discoveryRoles.push(role);
        return { sources: [], reason: "No source" };
      }),
    ).toBe("blocked");
    expect(discoveryRoles).toEqual(["discovery"]);
    db.enqueue(candidate, evidence, DEFAULT_MODEL);
    const job = db.claim("owner", 10000)!;
    expect(
      await executeJob(db, job, "owner", async (role) =>
        role === "writer" ? draft : { decision: "reject", reason: "Unsupported interpretation" },
      ),
    ).toBe("rejected");
    expect(db.claim("again", 10000)).toBeNull();
  } finally {
    db.close();
  }
});
test("parent officialSource readback rejects forged quotations, third-party domains and script-only text", async () => {
  expect(isOfficialUrl("https://en.dragon-ball-official.com/news/1")).toBe(true);
  expect(isOfficialUrl("https://dragon-ball-official.com.evil.test/news")).toBe(false);
  expect(isOfficialUrl("https://user:password@dragon-ball-official.com/news")).toBe(false);
  const officialSource = {
    url: "https://en.dragon-ball-official.com/news/1",
    title: "Fixture",
    quote: "Son Goku rencontre Bulma.",
  };
  const fakeFetch = async () =>
    new Response(
      "<html><body><script>Forged script quote</script><p>Son Goku rencontre Bulma.</p></body></html>",
      { headers: { "Content-Type": "text/html" } },
    );
  const verified = await qualifyOfficialSource(officialSource, fakeFetch);
  expect(verified.evidence.excerpt).toBe(officialSource.quote);
  expect(verified.evidence.bodySha256).toHaveLength(64);
  expect(verified.evidence.retrievedAt).toBeString();
  await expect(
    qualifyOfficialSource(
      { ...officialSource, quote: "An entirely invented quotation" },
      fakeFetch,
    ),
  ).rejects.toThrow("absent");
  await expect(
    qualifyOfficialSource({ ...officialSource, quote: "Forged script quote" }, fakeFetch),
  ).rejects.toThrow("absent");
  await expect(
    qualifyOfficialSource({ ...officialSource, url: "https://dragonball.fandom.com/a" }, fakeFetch),
  ).rejects.toThrow("allowlist");
});
test("inventory pages through API, excludes hidden rows and refuses drifting totals", async () => {
  const offsets: number[] = [];
  const fetcher = async (url: URL, options: RequestInit) => {
    expect(options.method).toBeUndefined();
    offsets.push(Number(url.searchParams.get("offset")));
    return Response.json({
      total: 501,
      rows:
        offsets.length === 1
          ? Array.from({ length: 500 }, (_, i) => ({ ...row, id: i + 1, visible: i !== 0 }))
          : [{ ...row, id: 501 }],
    });
  };
  const result = await inventory("https://example.test", "fixture", ["db_characters"], fetcher);
  expect(offsets).toEqual([0, 500]);
  expect(result).toHaveLength(500);
  let call = 0;
  await expect(
    inventory("https://example.test", "fixture", ["db_characters"], async () =>
      Response.json({ total: ++call === 1 ? 501 : 502, rows: [row] }),
    ),
  ).rejects.toThrow("drifting");
});
test("Codex process has explicit model, read-only sandbox, disabled tools and no business credentials", () => {
  const env = codexEnvironment({
    PATH: "/bin",
    HOME: "/tmp/fixture",
    SHENRON_API_ADMIN_TOKEN: "private",
    DATABASE_URL: "private",
    OPENAI_API_KEY: "private",
  });
  expect(env).toEqual({ PATH: "/bin", HOME: "/tmp/fixture" });
  const args = codexArguments(DEFAULT_MODEL, "/tmp/job", "/tmp/schema", "/tmp/result");
  expect(args[args.indexOf("--model") + 1]).toBe("gpt-5.6-luna");
  expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
  expect(args).toContain("--ignore-user-config");
  expect(args).toContain("shell_tool");
  expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  const discoveryArgs = codexArguments(
    DEFAULT_MODEL,
    "/tmp/job",
    "/tmp/schema",
    "/tmp/result",
    true,
  );
  expect(discoveryArgs[discoveryArgs.indexOf("code_mode_host") - 1]).toBe("--enable");
  expect(discoveryArgs[discoveryArgs.indexOf("shell_tool") - 1]).toBe("--disable");
  expect(discoveryArgs).toContain('web_search="live"');
});
test("full administrative snapshots remain private while model prompts get only entity identity", async () => {
  const { db } = await queue();
  try {
    const protectedCandidate = candidateFor("db_characters", {
      ...row,
      streamHeaders: { Authorization: "must-never-enter-model-context" },
    })!;
    db.enqueue(protectedCandidate, evidence, DEFAULT_MODEL);
    const job = db.claim("owner", 10000)!;
    expect(
      await executeJob(db, job, "owner", async (...args) => {
        expect(args[1]).not.toContain("must-never-enter-model-context");
        return successfulRunner(...args);
      }),
    ).toBe("approved");
  } finally {
    db.close();
  }
});
