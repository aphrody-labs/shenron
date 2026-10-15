import { expect, test } from "bun:test";
import { validateOperation, probeCas, type Operation } from "./publish-wiki-proposals";
import { wikiUpdateSnapshotHash } from "../../apps/site/src/lib/wiki-update-precondition";

const snapshot = { id: 15, slug: "jaco", title: "Jaco", visible: true, synopsisFr: "" };
const evidence = {
  id: "official:test",
  kind: "official" as const,
  locator: {},
  document: "Jaco",
  sourceUrl: "https://www.shueisha.co.jp/books/",
  matchedTerm: "Jaco",
  excerpt: "Jaco arrive sur Terre.",
  textSha256: "a".repeat(64),
};
const operation: Operation = {
  key: "b".repeat(64),
  method: "PATCH",
  path: "/api/wiki-admin/media_works/15",
  body: {
    synopsisFr: "Jaco arrive sur Terre.",
    expected: snapshot,
    expectedSha256: wikiUpdateSnapshotHash(snapshot),
  },
  evidence: [evidence],
  draft: {
    decision: "propose",
    changes: [
      {
        field: "synopsisFr",
        value: "Jaco arrive sur Terre.",
        claims: [{ evidenceId: evidence.id, quote: evidence.excerpt, text: "Arrivée" }],
      },
    ],
    reason: "Primary source",
  },
  review: { decision: "approve", reason: "Supported" },
};
test("publisher binds approval, eligible prose, exact identity and unchanged draft", () => {
  expect(validateOperation(operation).id).toBe("15");
  expect(() => validateOperation({ ...operation, path: "/api/wiki-admin/media_works/16" })).toThrow(
    "identity",
  );
  expect(() =>
    validateOperation({ ...operation, review: { decision: "reject", reason: "No" } }),
  ).toThrow("approval");
  expect(() =>
    validateOperation({ ...operation, body: { ...operation.body, visible: true } }),
  ).toThrow("reviewed draft");
  expect(() =>
    validateOperation({
      ...operation,
      body: { ...operation.body, expected: { ...snapshot, visible: false } },
    }),
  ).toThrow();
});
test("live CAS probe never sends proposed content and rejects an ignoring server", async () => {
  await probeCas(operation, async (_path, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.synopsisFr).toBe("");
    expect(body.expectedSha256).toBe("0".repeat(64));
    return Response.json({ error: "wiki_update_precondition_changed" }, { status: 409 });
  });
  await expect(probeCas(operation, async () => Response.json({ ok: true }))).rejects.toThrow(
    "CAS enforcement",
  );
});
