// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  parseContributionListQuery,
  reviewContributionSchema,
  wikiAiRequestSchema,
} from "../src/lib/wiki-editorial-contracts";

test("queues share bounded pagination and reject invalid filters", () => {
  expect(
    parseContributionListQuery(new URLSearchParams("limit=25&offset=50&status=pending")).data,
  ).toEqual({ limit: 25, offset: 50, status: "pending" });
  expect(parseContributionListQuery(new URLSearchParams(), 20).data).toEqual({
    limit: 20,
    offset: 0,
  });
  for (const query of [
    "limit=Infinity",
    "limit=-1",
    "limit=0",
    "limit=201",
    "offset=-2",
    "offset=1.5",
    "status=published",
  ]) {
    expect(parseContributionListQuery(new URLSearchParams(query)).success, query).toBe(false);
  }
});

test("moderation accepts only a bounded identified decision", () => {
  expect(
    reviewContributionSchema.parse({ id: " c1 ", action: "accept", note: " verified " }),
  ).toEqual({ id: "c1", action: "accept", note: "verified" });
  for (const body of [
    null,
    [],
    { id: {}, action: "accept" },
    { id: "1", action: "publish" },
    { id: "1", action: "reject", note: {} },
    { id: "1", action: "reject", note: "x".repeat(4001) },
  ]) {
    expect(reviewContributionSchema.safeParse(body).success).toBe(false);
  }
});

test("AI generation is an explicit action with a bounded typed request", () => {
  expect(wikiAiRequestSchema.parse({ query: "  Namek  " })).toEqual({
    query: "Namek",
    limit: 8,
    action: "search",
    lang: "fr",
  });
  expect(
    wikiAiRequestSchema.parse({ query: "Namek", action: "draft", lang: "ja", limit: 12 }).action,
  ).toBe("draft");
  for (const body of [
    { query: {} },
    { query: " " },
    { query: "x".repeat(2001) },
    { query: "x", limit: 1.5 },
    { query: "x", entity: {} },
    { query: "x", action: "publish" },
  ]) {
    expect(wikiAiRequestSchema.safeParse(body).success).toBe(false);
  }
});
