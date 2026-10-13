import { expect, test } from "bun:test";
import { archivePayload, contentSha256, rowIdentity, sameRow } from "./archive-bot-sqlite-variants";

test("archive identity and digest are stable while canonical equality is type-normalized", () => {
  const source = { race: "saiyan", level: 2, role_id: "123456789012345678" };
  expect(rowIdentity("race_level_roles", source)).toBe('["saiyan","2"]');
  expect(
    sameRow("race_level_roles", source, { race: "saiyan", level: "2", role_id: source.role_id }),
  ).toBe(true);
  expect(sameRow("race_level_roles", source, { ...source, role_id: "other" })).toBe(false);
  const payload = archivePayload("race_level_roles", source);
  expect(contentSha256(payload)).toBe(
    contentSha256(archivePayload("race_level_roles", { ...source })),
  );
  expect(contentSha256(payload)).not.toBe(
    contentSha256(archivePayload("race_level_roles", { ...source, role_id: "other" })),
  );
});
