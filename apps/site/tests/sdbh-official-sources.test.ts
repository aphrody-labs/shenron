import { describe, expect, test } from "bun:test";
import { SDBH_OFFICIAL_EPISODE_IDS, sdbhOfficialSourceUrl } from "../src/lib/sdbh-official-sources";

describe("SDBH official episode sources", () => {
  test("maps every audited public SDBH episode ID to its exact official YouTube URL", () => {
    expect(SDBH_OFFICIAL_EPISODE_IDS).toEqual(
      Array.from({ length: 48 }, (_, index) => index + 827),
    );
    for (const id of SDBH_OFFICIAL_EPISODE_IDS) {
      expect(sdbhOfficialSourceUrl(id)).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    }
  });

  test("does not invent links for IDs outside the audited mapping", () => {
    expect(sdbhOfficialSourceUrl(826)).toBeNull();
    expect(sdbhOfficialSourceUrl("not-an-id")).toBeNull();
  });
});
