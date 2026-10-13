import { expect, test } from "bun:test";
import { allowsPublicAds, needsAdvertisingReset } from "../src/lib/public-ads";

test("advertising never loads on administration or editorial staff workspaces", () => {
  for (const path of [
    "/admin",
    "/admin/dashboard",
    "/admin/dashboard/",
    "/workshop/transcription",
    "/workshop/translation/19",
    "/workshop/databooks/19",
    "/studio",
    "/desktop/control",
    "/atelier/traduction",
    "/admin/databooks",
    null,
  ])
    expect(allowsPublicAds(path)).toBe(false);
});

test("public library and workshop overview retain advertising", () => {
  for (const path of [
    "/",
    "/news/test",
    "/wiki/manga",
    "/workshop",
    "/administrator",
    "/workshop/translation-guide",
  ])
    expect(allowsPublicAds(path)).toBe(true);
});

test("only leaving public advertising for a staff route requires a fresh document", () => {
  expect(needsAdvertisingReset("/", "/admin/dashboard")).toBe(true);
  expect(needsAdvertisingReset("/wiki/manga", "/workshop/translation")).toBe(true);
  expect(needsAdvertisingReset("/admin/wiki", "/admin/dashboard")).toBe(false);
  expect(needsAdvertisingReset("/admin/dashboard", "/news")).toBe(false);
  expect(needsAdvertisingReset("/news", "/wiki/manga")).toBe(false);
  expect(needsAdvertisingReset(null, "/admin/dashboard")).toBe(false);
});
