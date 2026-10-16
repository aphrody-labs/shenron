import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FillQueue,
  candidateFor,
  DEFAULT_MODEL,
  type Runner,
  verifiedEvidence,
} from "./wiki-fill-agents";
import {
  INTERVAL_MS,
  initializeSupervisor,
  reconcileInventory,
  hasSupervisorSmoke,
  superviseCandidates,
  qualifySupervisorSmoke,
  provedTransportFailure,
  immutableApprovedExport,
  protectedAdminToken,
} from "./wiki-fill-supervisor";
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "wiki-supervisor-"));
  dirs.push(dir);
  return { dir, q: new FillQueue(join(dir, "queue.sqlite")) };
}
const candidate = (id = 1) =>
  candidateFor("db_characters", {
    id,
    name: "Son Goku",
    slug: `goku-${id}`,
    visible: true,
    description: null,
    article: "Existing prose",
  })!;
function evidence() {
  const text = "Son Goku rencontre Bulma.";
  return verifiedEvidence(candidate(), {
    records: [
      {
        kind: "manga",
        locator: { series: "DB", volume: "1", page: 1 },
        document: "Primary fixture",
        sourceUrl: "https://dragonballfr.com/wiki/manga/volume/1",
        text,
        verified: true,
      },
    ],
    attestations: [
      {
        textSha256: new Bun.CryptoHasher("sha256").update(text).digest("hex"),
        method: "human_transcription_review",
        checkedBy: "fixture",
        checkedAt: "2026-10-15T00:00:00Z",
      },
    ],
  });
}
const runner: Runner = async (role) =>
  role === "writer"
    ? {
        decision: "propose",
        changes: [
          {
            field: "description",
            value: "Son Goku rencontre Bulma.",
            claims: [
              {
                evidenceId: evidence()[0]!.id,
                quote: "Son Goku rencontre Bulma.",
                text: "Rencontre avec Bulma",
              },
            ],
          },
        ],
        reason: "Literal fixture",
      }
    : { decision: "approve", reason: "Literal primary evidence" };
function gate(q: FillQueue, contract = "contract") {
  q.db
    .query(
      "INSERT INTO jobs(key,payload,status,attempts,updated_at) VALUES('smoke','{}','approved',1,0)",
    )
    .run();
  q.db
    .query("INSERT OR REPLACE INTO meta VALUES('supervisor-smoke',?)")
    .run(JSON.stringify({ key: "smoke", implementationSha256: contract, model: DEFAULT_MODEL }));
}
test("inventory never resets semantic or approved decisions after implementation and live-row changes", async () => {
  const { q } = await fixture();
  try {
    reconcileInventory(q, [candidate()], "old", 0);
    const old = q.db.query("SELECT job_key FROM targets").get() as { job_key: string };
    for (const status of ["rejected", "quarantined", "approved", "blocked"]) {
      q.db
        .query("UPDATE jobs SET status=?,draft='original',review='original' WHERE key=?")
        .run(status, old.job_key);
      const changed = { ...candidate(), sha256: "new-live-hash" };
      expect(reconcileInventory(q, [changed], "new", 1)).toBe(0);
      expect(
        q.db.query("SELECT status,draft,review FROM jobs WHERE key=?").get(old.job_key),
      ).toEqual({ status, draft: "original", review: "original" });
      expect(q.db.query("SELECT job_key FROM targets").get()).toEqual(old);
    }
    expect((q.db.query("SELECT count(*) n FROM jobs").get() as { n: number }).n).toBe(1);
  } finally {
    q.close();
  }
});
test("exact smoke is independent from target state and quarantine closes its gate", async () => {
  const { q } = await fixture();
  try {
    reconcileInventory(q, [candidate()], "old", 0);
    const pointer = q.db.query("SELECT job_key FROM targets").get();
    const result = await qualifySupervisorSmoke(q, candidate(), evidence(), "contract", runner);
    expect(result.status).toBe("approved");
    expect(q.db.query("SELECT job_key FROM targets").get()).toEqual(pointer);
    expect(hasSupervisorSmoke(q, "contract")).toBe(true);
    expect(hasSupervisorSmoke(q, "different")).toBe(false);
    await expect(
      qualifySupervisorSmoke(q, candidate(), evidence(), "contract", runner),
    ).rejects.toThrow("never reset");
    q.db.query("UPDATE jobs SET status='quarantined' WHERE key=?").run(result.key);
    expect(hasSupervisorSmoke(q, "contract")).toBe(false);
  } finally {
    q.close();
  }
});
test("pass caps at twenty candidates and four concurrent independent runners", async () => {
  const { q } = await fixture();
  try {
    gate(q);
    initializeSupervisor(q);
    for (let i = 1; i <= 25; i++) {
      const c = candidate(i);
      q.enqueue(c, evidence(), DEFAULT_MODEL, "contract");
      q.db
        .query("INSERT INTO wiki_supervisor_inventory VALUES(?,?,1,0)")
        .run(`${c.table}:${c.id}`, c.sha256);
    }
    let active = 0,
      peak = 0;
    const bounded: Runner = async (...args) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const answer = await runner(...args);
      active--;
      return answer;
    };
    const result = await superviseCandidates(q, "contract", bounded);
    expect(result.processed).toBe(20);
    expect(peak).toBe(4);
    expect(
      (q.db.query("SELECT count(*) n FROM jobs WHERE status='queued'").get() as { n: number }).n,
    ).toBe(5);
    await expect(superviseCandidates(q, "contract", bounded, { concurrency: 5 })).rejects.toThrow(
      "bounds",
    );
  } finally {
    q.close();
  }
});
test("only current-attempt proven transport retries after six hours, preserving its key and counter", async () => {
  const { q } = await fixture();
  try {
    gate(q);
    reconcileInventory(q, [candidate()], "contract", 0);
    const row = q.db.query("SELECT j.* FROM jobs j JOIN targets t ON j.key=t.job_key").get() as any;
    q.db
      .query(
        "UPDATE jobs SET status='blocked',attempts=1,error='No official quotation independently qualified',updated_at=0 WHERE key=?",
      )
      .run(row.key);
    q.receipt(row.key, "source-rejected", { attempt: 1, transport: true });
    const latest = q.db.query("SELECT * FROM jobs WHERE key=?").get(row.key) as any;
    expect(provedTransportFailure(q, latest)).toBe(true);
    expect(provedTransportFailure(q, { ...latest, attempts: 2 })).toBe(false);
    expect((await superviseCandidates(q, "contract", runner, { now: 0 })).processed).toBe(0);
    expect(
      (await superviseCandidates(q, "contract", runner, { now: INTERVAL_MS - 1 })).processed,
    ).toBe(0);
    q.db.query("UPDATE jobs SET payload=? WHERE key=?").run(
      JSON.stringify({
        candidate: candidate(),
        evidence: evidence(),
        model: DEFAULT_MODEL,
        contract: "contract",
      }),
      row.key,
    );
    expect((await superviseCandidates(q, "contract", runner, { now: INTERVAL_MS })).processed).toBe(
      1,
    );
    expect(q.db.query("SELECT status,attempts FROM jobs WHERE key=?").get(row.key)).toEqual({
      status: "approved",
      attempts: 2,
    });
  } finally {
    q.close();
  }
});
test.skipIf(process.platform === "win32")(
  "exports are immutable private artifacts and credential parsing is redacted",
  async () => {
    const { q, dir } = await fixture();
    try {
      const first = await immutableApprovedExport(q, dir);
      expect(await immutableApprovedExport(q, dir)).toBe(first);
      expect((await stat(first)).mode & 0o777).toBe(0o600);
      expect(await Bun.file(first).json()).toEqual({ schemaVersion: 1, operations: [] });
      expect(
        protectedAdminToken(
          JSON.stringify([{ Config: { Env: ["API_ADMIN_TOKEN=secret=with-equals"] } }]),
        ),
      ).toBe("secret=with-equals");
      expect(() => protectedAdminToken("secret-invalid-json")).toThrow(
        "Protected credential owner malformed",
      );
    } finally {
      q.close();
    }
  },
);
