import { expect, test } from "bun:test";
import {
  validateOperation,
  probeCas,
  verifySectionContext,
  type Operation,
} from "./publish-wiki-proposals";
import { attachSectionContexts, candidateFor } from "./wiki-fill-agents";
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

test("section publication resolves the actual visible parent and rejects drift or invented identity", async () => {
  const parent = { id: 2, name: "Vegeta", nameRomaji: "Vegeta", visible: true };
  const section = {
    id: 13087,
    entityType: "character",
    entityId: 2,
    key: "durabilite",
    label: "Durabilité",
    body: null,
    visible: true,
  };
  const candidate = attachSectionContexts([
    candidateFor("db_wiki_sections", section)!,
    candidateFor("db_characters", parent)!,
  ])[0]!;
  const proposal: Operation = {
    ...operation,
    path: "/api/wiki-admin/db_wiki_sections/13087",
    body: { body: "Vegeta est blessé.", expected: section, expectedSha256: candidate.sha256 },
    discoveryContext: candidate.discoveryContext,
  };
  const fetchParent = async (path: string) => {
    expect(path).toBe("/api/wiki-admin/db_characters/2");
    return Response.json(parent);
  };
  await verifySectionContext(proposal, fetchParent);
  await expect(
    verifySectionContext(proposal, async () => Response.json({ ...parent, name: "Autre nom" })),
  ).rejects.toThrow("parent changed");
  const forged = structuredClone(proposal);
  forged.discoveryContext!.parent.identity.name = "Goku";
  await expect(verifySectionContext(forged, fetchParent)).rejects.toThrow("canonical parent");
  const foreign = structuredClone(proposal);
  foreign.discoveryContext!.parent.apiPath = "https://google.com/private";
  await expect(verifySectionContext(foreign, fetchParent)).rejects.toThrow("reference");
  await expect(
    verifySectionContext(proposal, async () => Response.json({ ...parent, visible: false })),
  ).rejects.toThrow("parent changed");
});
