// SPDX-License-Identifier: Apache-2.0
import { chmod, lstat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import postgres from "postgres";
import {
  crawlIngestPolicySchema,
  createPostgresCrawlRegistry,
  ingestNativeCrawl,
  projectNativeCrawl,
  type ExternalCrawlRecord,
} from "@aphrody/shenron-pipeline/dragon-ball/crawl-ingest";

export const archiveDigest = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");

export function validateArchiveInput(
  body: string,
  policyValue: unknown,
  collection: {
    complete: boolean;
    records: number;
    exportSha256: string;
  },
  expectedSha: string,
): ExternalCrawlRecord[] {
  if (
    !/^[a-f0-9]{64}$/.test(expectedSha) ||
    !collection.complete ||
    collection.exportSha256 !== expectedSha ||
    archiveDigest(body) !== expectedSha
  )
    throw new Error("Archive export integrity differs");
  const policy = crawlIngestPolicySchema.parse(policyValue);
  if (
    policy.sources.length !== 1 ||
    policy.sources[0]!.domain !== "archive.org" ||
    policy.sources[0]!.kind !== "archive" ||
    policy.sources[0]!.rights.ragPermitted ||
    policy.sources[0]!.rights.trainingPermitted ||
    !policy.sources[0]!.rights.publicImagesPermitted
  )
    throw new Error("Archive rights policy differs from the reviewed scope");
  const records = body
    .trim()
    .split("\n")
    .flatMap((line) => {
      const document = JSON.parse(line);
      if (
        !["archive-movies", "archive-images"].includes(document.category) ||
        !document.canonical_url.startsWith("https://archive.org/details/") ||
        document.payload.embedded_media.length !== 0
      )
        throw new Error("Archive identity or reference scope differs");
      const projected = projectNativeCrawl(document, policy);
      if (projected.length !== 1)
        throw new Error("Archive notice must produce one registry record");
      return projected;
    });
  if (
    records.length !== collection.records ||
    records.length < 1 ||
    records.length > 10000 ||
    new Set(records.map((record) => record.url)).size !== records.length
  )
    throw new Error("Archive identity enumeration differs");
  return records;
}

type Row = Record<string, unknown> & {
  url: string;
  canonical_eligible: boolean;
  fetched_at: Date | string;
  provenance: unknown;
};
function entityState(rows: Row[]) {
  return rows.map(
    ({
      url,
      kind,
      title,
      excerpt,
      http_status,
      content_hash,
      fetched_at,
      canonical_eligible,
      provenance,
    }) => ({
      url,
      kind,
      title,
      excerpt,
      http_status,
      content_hash,
      fetched_at: new Date(fetched_at).toISOString(),
      canonical_eligible,
      provenance,
    }),
  );
}

async function run() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    strict: true,
    options: {
      job: { type: "string" },
      "expected-sha": { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  if (!values.job || !isAbsolute(values.job) || !values["expected-sha"])
    throw new Error(
      "Usage: apply-archive-catalog --job <protected-absolute-directory> --expected-sha <sha256> [--apply]",
    );
  const root = resolve(values.job);
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error("Archive job must be a protected regular directory");
  const inputPath = join(root, "native-export.jsonl");
  const policy = await Bun.file(join(root, "policy.json")).json();
  const collection = await Bun.file(join(root, "collection.json")).json();
  const records = validateArchiveInput(
    await Bun.file(inputPath).text(),
    policy,
    collection,
    values["expected-sha"],
  );
  const planned = await ingestNativeCrawl({ inputPath, policy, maxDocuments: 10000 });
  if (
    !planned.complete ||
    planned.records !== records.length ||
    planned.documents !== records.length ||
    planned.mediaReferences !== 0
  )
    throw new Error("Canonical archive preflight differs");
  if (!process.env.DATABASE_URL)
    throw new Error("The existing protected DBFR environment is required");
  const sql = postgres(process.env.DATABASE_URL, {
    max: 2,
    prepare: false,
    onnotice: () => {},
    connection: { statement_timeout: 30000 },
  });
  const urls = records.map((record) => record.url);
  const owner = createPostgresCrawlRegistry(sql);
  const save = async (name: string, value: unknown) => {
    const path = join(root, name);
    if (await Bun.file(path).exists()) throw new Error(`Archive receipt already exists: ${name}`);
    await Bun.write(path, JSON.stringify(value, null, 2) + "\n");
    await chmod(path, 0o600);
  };
  async function snapshot() {
    const rows = await sql<Row[]>`SELECT r.*, p.provenance, p.updated_at AS provenance_updated_at
      FROM public.external_source_records r LEFT JOIN public.external_source_provenance p USING(url)
      WHERE r.url IN ${sql(urls)} ORDER BY r.url`;
    const counts = await sql`SELECT current_database() AS database, count(*)::int AS records,
      count(*) FILTER (WHERE kind='archive')::int AS archives FROM public.external_source_records`;
    const other =
      await sql`SELECT md5(string_agg(url || '|' || coalesce(content_hash,'') || '|' || canonical_eligible::text,
      E'\n' ORDER BY url)) AS digest FROM public.external_source_records WHERE url NOT IN ${sql(urls)}`;
    return { rows, counts: counts[0], untouchedDigest: other[0]!.digest };
  }
  try {
    await owner.assertReady();
    const current = await snapshot();
    const currentSha = archiveDigest(JSON.stringify(current.rows));
    if (!values.apply) {
      const protectedRows = current.rows.filter(
        (row) =>
          row.canonical_eligible || new Date(row.fetched_at) > new Date(records[0]!.fetchedAt),
      );
      await save("before.json", current);
      const plan = {
        schema: "shenron-archive-apply-plan/v1",
        planned,
        exportSha256: values["expected-sha"],
        targetIdentities: records.length,
        existing: current.rows.length,
        newIdentities: records.length - current.rows.length,
        protectedIdentities: protectedRows.length,
        beforeSha256: currentSha,
        beforeCounts: current.counts,
        untouchedDigest: current.untouchedDigest,
        observedAt: new Date().toISOString(),
        canonicalPromotions: 0,
        mediaDownloaded: 0,
      };
      await save("apply-plan.json", plan);
      console.log(JSON.stringify(plan));
      return;
    }
    const plan = await Bun.file(join(root, "apply-plan.json")).json();
    const before = await Bun.file(join(root, "before.json")).json();
    const backup = await Bun.file(join(root, "backup.json")).json();
    if (
      plan.exportSha256 !== values["expected-sha"] ||
      plan.beforeSha256 !== currentSha ||
      archiveDigest(JSON.stringify(before.rows)) !== currentSha ||
      before.untouchedDigest !== current.untouchedDigest ||
      !backup.inventoryVerified ||
      !/^[a-f0-9]{64}$/.test(backup.sha256) ||
      archiveDigest(await Bun.file(join(root, "registry-before.dump")).bytes()) !== backup.sha256
    )
      throw new Error("Archive snapshot, backup or optimistic precondition changed");
    const protectedUrls = new Set(
      current.rows
        .filter(
          (row) =>
            row.canonical_eligible || new Date(row.fetched_at) > new Date(records[0]!.fetchedAt),
        )
        .map((row) => row.url),
    );
    const applied = await ingestNativeCrawl(
      { inputPath, policy, apply: true, maxDocuments: 10000 },
      owner,
    );
    const after = await snapshot();
    const observed = new Map(after.rows.map((row) => [row.url, row]));
    for (const record of records) {
      const row = observed.get(record.url);
      if (!row) throw new Error("Archive readback identity missing");
      if (protectedUrls.has(record.url)) {
        const prior = before.rows.find((item: Row) => item.url === record.url);
        if (JSON.stringify(entityState([row])) !== JSON.stringify(entityState([prior])))
          throw new Error("Protected archive record changed");
      } else if (
        row.canonical_eligible ||
        row.kind !== record.kind ||
        row.title !== record.title ||
        row.excerpt !== record.excerpt ||
        row.content_hash !== record.contentHash ||
        row.http_status !== record.httpStatus ||
        new Date(row.fetched_at).toISOString() !== record.fetchedAt ||
        !Bun.deepEquals(row.provenance, record.provenance)
      )
        throw new Error("Canonical archive readback differs");
    }
    if (
      !applied.complete ||
      after.rows.length !== records.length ||
      current.untouchedDigest !== after.untouchedDigest
    )
      throw new Error("Archive apply changed the reviewed scope");
    const replay = await ingestNativeCrawl(
      { inputPath, policy, apply: true, maxDocuments: 10000 },
      owner,
    );
    const again = await snapshot();
    const entitySha256 = archiveDigest(JSON.stringify(entityState(after.rows)));
    if (
      !replay.complete ||
      entitySha256 !== archiveDigest(JSON.stringify(entityState(again.rows))) ||
      after.untouchedDigest !== again.untouchedDigest
    )
      throw new Error("Canonical archive replay changed registry state");
    await save("after.json", again);
    const receipt = {
      schema: "shenron-archive-apply-receipt/v1",
      checkedAt: new Date().toISOString(),
      planned,
      applied,
      replay,
      backup,
      beforeCounts: before.counts,
      afterCounts: again.counts,
      readback: again.rows.length,
      readbackSha256: entitySha256,
      untouchedDigest: again.untouchedDigest,
      replayStateEqual: true,
      canonicalPromotions: 0,
      mediaDownloaded: 0,
    };
    await save("receipt.json", receipt);
    console.log(JSON.stringify(receipt));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
if (import.meta.main) await run();
