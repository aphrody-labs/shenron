// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import postgres from "postgres";
import {
  VARIANT_MEASUREMENT_EVIDENCE_SQL,
  variantMeasurementVolumeSql,
} from "../scripts/variant-measurement-policy";
import { VARIANT_ASSET_DEDUP_PREDICATE } from "../../bot/scripts/variant-asset-dedup-policy";

// Explicit isolated QA URL only. Every object is temporary; no database is dropped.
const url = process.env.SHENRON_CONSOLIDATION_TEST_DATABASE_URL?.trim();
describe.skipIf(!url)("variant measurement evidence on isolated PostgreSQL", () => {
  test("replaces measured evidence and retains precisely both editorial keys and root fields", async () => {
    const parsed = new URL(url!);
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !/^shenron_wiki_qa_[a-z0-9_]+$/.test(decodeURIComponent(parsed.pathname.slice(1)))
    )
      throw new Error("Explicit isolated shenron_wiki_qa database required");
    const sql = postgres(url!, { max: 1 });
    try {
      await sql.begin(async (tx) => {
        await tx`create temporary table db_character_variants (id int primary key, summary text, image text, technique_ids jsonb, visible boolean, origin text, evidence jsonb, first_volume int, last_volume int) on commit drop`;
        const references = [
          {
            fields: ["summary", "lastVolume"],
            url: "https://dragonballfr.com/wiki/manga/1438?page=41",
            title: "Manga",
            locator: "Chapter221",
          },
        ];
        const artwork = {
          kind: "generated",
          image: "./assets/wiki/generated-portraits/test.webp",
          outputSha256: "a".repeat(64),
        };
        for (const [id, evidence] of [
          [
            1,
            { oldMeasure: 17, planches: 1, editorialReferences: references, imageArtwork: artwork },
          ],
          [2, { oldMeasure: 22 }],
          [3, { editorialReferences: null, imageArtwork: null }],
          [4, {}],
          [5, { editorialReferences: [{ ...references[0], fields: ["firstVolume"] }] }],
        ] as const) {
          const image =
            id === 2
              ? "./assets/wiki/ordinary.webp"
              : "./assets/wiki/generated-portraits/test.webp";
          await tx`insert into db_character_variants values (${id}, 'reviewed summary', ${image}, '[159]'::jsonb, false, 'ocr-manga', ${tx.json(evidence)},24,27)`;
          const measured = { methode: "ocr-manga", planches: 42, mesureAt: 1000 };
          await tx`insert into db_character_variants (id,evidence,origin,first_volume,last_volume) values (${id},${tx.json(measured)},'ocr-manga',25,28) on conflict(id) do update set evidence=${tx.unsafe(VARIANT_MEASUREMENT_EVIDENCE_SQL)}, origin=excluded.origin, first_volume=${tx.unsafe(variantMeasurementVolumeSql("firstVolume"))}, last_volume=${tx.unsafe(variantMeasurementVolumeSql("lastVolume"))}`;
          const [row] = await tx`select * from db_character_variants where id=${id}`;
          expect(row).toMatchObject({
            summary: "reviewed summary",
            image,
            technique_ids: [159],
            visible: false,
            origin: "ocr-manga",
            first_volume: id === 5 ? 24 : 25,
            last_volume: id === 1 ? 27 : 28,
          });
          expect(row!.evidence).toEqual(
            id === 1
              ? { ...measured, editorialReferences: references, imageArtwork: artwork }
              : id === 2 || id === 4
                ? measured
                : id === 3
                  ? { ...measured, editorialReferences: null, imageArtwork: null }
                  : {
                      ...measured,
                      editorialReferences: [{ ...references[0], fields: ["firstVolume"] }],
                    },
          );
          const rewritten =
            await tx`update db_character_variants set image='./assets/wiki/deduplicated.webp' where id=${id} and ${tx.unsafe(VARIANT_ASSET_DEDUP_PREDICATE)} returning id`;
          expect(rewritten.length).toBe(id === 2 ? 1 : 0);
          const [afterDedup] =
            await tx`select image,evidence from db_character_variants where id=${id}`;
          expect(afterDedup!.image).toBe(
            id === 2
              ? "./assets/wiki/deduplicated.webp"
              : "./assets/wiki/generated-portraits/test.webp",
          );
          expect(afterDedup!.evidence).toEqual(row!.evidence);
        }
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
