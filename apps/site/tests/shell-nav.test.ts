/**
 * The public shell never carries an administration entry nor an internal tool: the admin
 * has its own navigation (`AdminSidebar`), staff tools keep their own pages.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SHELL_HIDDEN_HREFS, isAdminHref, publicShellJourneys } from "@/lib/shell-nav";
import { ALL_ENTRIES } from "@/lib/wiki-launch";

const source = (relative: string) => readFileSync(path.join(import.meta.dir, relative), "utf8");

/** Every registry entry opened to the public: the widest navigation a visitor can get. */
const allOpen = {
  openKeys: ALL_ENTRIES.map((entry) => entry.key),
  access: Object.fromEntries(
    ALL_ENTRIES.map((entry) => [entry.key, { mode: "public" as const, roleIds: [] }]),
  ),
};

describe("public shell navigation", () => {
  for (const [name, cfg] of [
    ["default launch config", null],
    ["every entry open", allOpen],
  ] as const) {
    test(`no admin entry nor internal tool (${name})`, () => {
      const hrefs = publicShellJourneys(cfg).flatMap((journey) =>
        journey.items.map((item) => item.href),
      );
      expect(hrefs.length).toBeGreaterThan(5);
      expect(hrefs.filter(isAdminHref)).toEqual([]);
      expect(hrefs.filter((href) => SHELL_HIDDEN_HREFS.has(href))).toEqual([]);
      expect(hrefs).toContain("/");
      expect(hrefs).toContain("/wiki/characters");
    });
  }

  test("the client shell and the account block add no admin entry", () => {
    for (const file of [
      "../src/components/SiteShell.tsx",
      "../src/components/SiteShellClient.tsx",
      "../src/components/NavAuth.tsx",
    ]) {
      const code = source(file);
      expect(code).not.toMatch(/href=\{?["']\/admin|["']\/admin\//);
      expect(code).not.toMatch(/isAdmin/);
    }
  });

  test("the administration keeps its own navigation", () => {
    const layout = source("../src/app/admin/layout.tsx");
    expect(layout).toContain("AdminSidebar");
    expect(source("../src/components/admin/AdminSidebar.tsx")).toContain("ShellContextNav");
  });
});
