import { expect, test } from "bun:test";
import { catalogSourceFilters, catalogBrowseHref } from "../src/lib/catalog-source-query";
test("archives initially match explicit title labels and all notices remain accessible", () => {
  expect(catalogSourceFilters("archive_movies")).toEqual({
    order: "title",
    focus: "dragon-ball",
    kind: "",
    domain: "",
  });
  expect(catalogSourceFilters("archive_images", { focus: "all" }).focus).toBe("all");
  expect(catalogSourceFilters("sources").focus).toBe("dragon-ball");
  expect(
    catalogSourceFilters("sources", {
      order: "title DESC; DROP TABLE",
      kind: "adult",
      domain: "example.com/evil",
    }),
  ).toEqual({ order: "source", focus: "dragon-ball", kind: "", domain: "" });
  expect(catalogSourceFilters("sources", { domain: "WWW.Archive.org" }).domain).toBe("archive.org");
});
test("late pages preserve applied filters and escaped source queries", () => {
  const url = new URL(
    catalogBrowseHref(
      "archive_movies",
      {
        q: "鳥山 & Ball",
        focus: "all",
        order: "oldest",
        domain: "archive.org",
        parent: "a-b",
        kind: "archive",
      },
      959,
    ),
    "https://dragonballfr.com",
  );
  expect(url.searchParams.get("page")).toBe("959");
  expect(url.searchParams.get("q")).toBe("鳥山 & Ball");
  expect(url.searchParams.get("focus")).toBe("all");
  expect(url.searchParams.get("order")).toBe("oldest");
  expect(url.searchParams.get("parent")).toBe("a-b");
});
