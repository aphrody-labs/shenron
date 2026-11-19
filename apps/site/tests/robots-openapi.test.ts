// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import robots from "@/app/robots";
import { AI_CRAWLERS } from "@/lib/ai-access";

const OPENAPI = "/api/public/openapi.json";

function groupFor(userAgent: string) {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  const group = list.find((rule) => [rule.userAgent].flat().includes(userAgent));
  if (!group) throw new Error(`no robots group for ${userAgent}`);
  return group;
}

describe("robots.txt and the public OpenAPI document", () => {
  test("every AI crawler group allows the OpenAPI document and keeps /api/ disallowed", () => {
    for (const crawler of AI_CRAWLERS) {
      const group = groupFor(crawler);
      expect([group.allow].flat()).toContain(OPENAPI);
      expect([group.disallow].flat()).toContain("/api/");
    }
  });

  test("the wildcard group still disallows /api/ without an OpenAPI exception", () => {
    const group = groupFor("*");
    expect([group.disallow].flat()).toContain("/api/");
    expect([group.allow].flat()).not.toContain(OPENAPI);
  });
});
