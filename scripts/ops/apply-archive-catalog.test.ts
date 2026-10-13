// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { archiveDigest, validateArchiveInput } from "./apply-archive-catalog";

const policy = {
  version: 1,
  profile: "dbfr",
  sources: [
    {
      domain: "archive.org",
      kind: "archive",
      reviewed: true,
      evidence: "https://archive.org/search?query=dragon+ball&tab=movies",
      rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: true },
    },
  ],
};
const document = (category: string, id: string) => ({
  crawl_id: "archive-test",
  document_uid: id,
  canonical_url: `https://archive.org/details/${id}`,
  source_domain: "archive.org",
  category,
  http_status: 200,
  raw_checksum: "a".repeat(64),
  timestamp_utc: "2026-10-13T00:00:00.000Z",
  payload: {
    title_raw: id,
    body_markdown: "Original factual notice",
    public_excerpt: "Original factual notice",
    embedded_media: [],
  },
});

test("validates both archive catalogues and uses the canonical public projection", () => {
  const body =
    [document("archive-movies", "movie"), document("archive-images", "image")]
      .map((value) => JSON.stringify(value))
      .join("\n") + "\n";
  const sha = archiveDigest(body);
  const records = validateArchiveInput(
    body,
    policy,
    { complete: true, records: 2, exportSha256: sha },
    sha,
  );
  expect(records).toHaveLength(2);
  expect(records.map((record) => record.provenance.category)).toEqual([
    "archive-movies",
    "archive-images",
  ]);
  expect(records.every((record) => record.provenance.canonicalEligible === false)).toBe(true);
  expect(records.every((record) => record.kind === "archive")).toBe(true);
});

test("rejects corrupt or duplicate exports, changed rights and unsolicited media before opening PostgreSQL", () => {
  const valid = JSON.stringify(document("archive-movies", "movie")) + "\n";
  const check = (body: string, selectedPolicy: unknown = policy, count = 1) => {
    const sha = archiveDigest(body);
    return validateArchiveInput(
      body,
      selectedPolicy,
      { complete: true, records: count, exportSha256: sha },
      sha,
    );
  };
  expect(() =>
    validateArchiveInput(
      valid + " ",
      policy,
      { complete: true, records: 1, exportSha256: archiveDigest(valid) },
      archiveDigest(valid),
    ),
  ).toThrow("integrity");
  expect(() => check(valid + valid, policy, 2)).toThrow("identity enumeration");
  const changed = structuredClone(policy);
  changed.sources[0]!.rights.trainingPermitted = true;
  expect(() => check(valid, changed)).toThrow("rights policy");
  const unsolicited = document("archive-movies", "movie");
  const withMedia = {
    ...unsolicited,
    payload: {
      ...unsolicited.payload,
      embedded_media: [{ url: "https://archive.org/download/movie/video.mp4", type: "video" }],
    },
  };
  expect(() => check(JSON.stringify(withMedia))).toThrow("reference scope");
});
