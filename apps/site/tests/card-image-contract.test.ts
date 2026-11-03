// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { cardImageImportRequest, CARD_IMAGE_BATCH_MAX_ROWS } from "../src/lib/card-image-contract";
const item = {
  setId: "set-ja",
  cardNumber: "FB01-001",
  language: "ja",
  region: "JP",
  frontImageUrl: `https://cdn.dragonballfr.com/publications/carddass-reviewed/objects/${"a".repeat(64)}.jpg`,
  frontImageWidth: 172,
  frontImageHeight: 250,
  frontImageSourceUrl: "https://www.carddass.com/dbh/cardlist/FB01-001.jpg",
  frontImageRights: "Owner-authorized official catalogue thumbnail",
  sha256: "a".repeat(64),
};
test("card image plans preserve exact set/number/language/region and prohibit non-image mutations", () => {
  expect(cardImageImportRequest.safeParse({ intent: "preview", items: [item] }).success).toBe(true);
  for (const extra of [
    { status: "published" },
    { name: "new name" },
    { rarity: "SR" },
    { id: "other" },
  ])
    expect(
      cardImageImportRequest.safeParse({ intent: "preview", items: [{ ...item, ...extra }] })
        .success,
    ).toBe(false);
  expect(cardImageImportRequest.safeParse({ intent: "preview", items: [item, item] }).success).toBe(
    false,
  );
  expect(
    cardImageImportRequest.safeParse({
      intent: "preview",
      items: Array.from({ length: CARD_IMAGE_BATCH_MAX_ROWS + 1 }, (_, index) => ({
        ...item,
        cardNumber: String(index),
      })),
    }).success,
  ).toBe(false);
});
test("unsafe, mutable, mismatched or malformed image evidence never produces a valid plan", () => {
  for (const patch of [
    { frontImageUrl: "not a URL" },
    { frontImageUrl: item.frontImageUrl.replace("cdn.dragonballfr.com", "foreign.example") },
    { frontImageUrl: item.frontImageUrl + "?token=mutable" },
    { frontImageUrl: item.frontImageUrl.replace("https://", "https://secret@") },
    { frontImageUrl: item.frontImageUrl.replace(/jpg$/, "html") },
    { frontImageSourceUrl: "https://dragonball.fandom.com/wiki/Card" },
    { frontImageSourceUrl: "javascript:alert(1)" },
    { frontImageRights: "" },
    { sha256: "b".repeat(64) },
    { frontImageWidth: 0 },
  ])
    expect(
      cardImageImportRequest.safeParse({ intent: "preview", items: [{ ...item, ...patch }] })
        .success,
    ).toBe(false);
  expect(cardImageImportRequest.safeParse({ intent: "commit", items: [item] }).success).toBe(false);
});
