import { expect, test } from "bun:test";
import { adminPageForPath } from "../src/components/admin/admin-pages";
test("workspace resolution distinguishes creation, dynamic records and nested editors", () => {
  expect(adminPageForPath("/admin/posts/new")).toBe("postNew");
  expect(adminPageForPath("/admin/posts/42?tab=preview")).toBe("postEdit");
  expect(adminPageForPath("/admin/wiki/studio/db_episodes/876")).toBe("wikiStudio");
  expect(adminPageForPath("/admin/not-a-route")).toBeNull();
});
