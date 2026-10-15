// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { buildUnifiedStaffCatalog } from "../src/lib/unified-staff-catalog";

test("the public staff catalog includes the published article and preserves the biography", () => {
  const actor = {
    slug: "sean-schemmel",
    name: "Sean Schemmel",
    nationality: "en",
    roles: [],
    biography: "Existing editorial biography.",
    article: "Published film casting evidence.",
  };
  const [published] = buildUnifiedStaffCatalog([], [actor]);
  expect(published?.bioSummary).toContain(actor.biography);
  expect(published?.bioSummary).toContain(actor.article);
  expect(published?.wikiLink).toBe("/wiki/staff#sean-schemmel");
  const [legacy] = buildUnifiedStaffCatalog([], [{ ...actor, article: null }]);
  expect(legacy?.bioSummary).toBe(actor.biography);
  const [duplicate] = buildUnifiedStaffCatalog([], [{ ...actor, article: actor.biography }]);
  expect(duplicate?.bioSummary).toBe(actor.biography);
});
