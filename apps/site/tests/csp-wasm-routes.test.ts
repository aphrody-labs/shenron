import { describe, expect, test } from "bun:test";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import config from "../next.config";
import { cspRouteSources, WASM_ROUTE_PREFIXES } from "../src/lib/csp-wasm-routes";

const nextConfig = await config("phase-test", {});
const rules = (await nextConfig.headers?.()) ?? [];
const REPORT_ONLY = "Content-Security-Policy-Report-Only";

/** Every script-src Report-Only value that applies to `pathname`, one per matching rule. */
function scriptPolicies(pathname: string): string[] {
  return rules.flatMap((rule) => {
    const header = rule.headers.find((entry) => entry.key === REPORT_ONLY);
    if (!header) return [];
    const matches = getPathMatch(rule.source, { removeUnnamedParams: true, strict: true });
    return matches(pathname) ? [header.value] : [];
  });
}

describe("script-src Wasm policy", () => {
  test("wasm-unsafe-eval is granted on every route that instantiates Wasm and its subpaths", () => {
    for (const prefix of WASM_ROUTE_PREFIXES) {
      for (const pathname of [prefix, `${prefix}/sub`, `${prefix}/a/b`]) {
        const policies = scriptPolicies(pathname);
        expect(policies).toHaveLength(1);
        expect(policies[0]).toContain("'wasm-unsafe-eval'");
      }
    }
  });

  test("the two game routes are covered", () => {
    expect(WASM_ROUTE_PREFIXES).toContain("/games/xenoverse-2");
    expect(WASM_ROUTE_PREFIXES).toContain("/games/budokai-tenkaichi-3");
  });

  test("wasm-unsafe-eval is absent everywhere else, with exactly one policy per path", () => {
    for (const pathname of [
      "/",
      "/wiki",
      "/wiki/games/some-game",
      "/games",
      "/games/xenoverse-2-other",
      "/games/bingo",
      "/admin",
      "/admin/dashboards",
      "/asking",
      "/api/health",
    ]) {
      const policies = scriptPolicies(pathname);
      expect(policies).toHaveLength(1);
      expect(policies[0]).not.toContain("wasm-unsafe-eval");
    }
  });

  test("the enforced Content-Security-Policy never grants script execution", () => {
    const enforced = rules.flatMap((rule) =>
      rule.headers.filter((entry) => entry.key === "Content-Security-Policy"),
    );
    expect(enforced.length).toBeGreaterThan(0);
    for (const header of enforced) expect(header.value).not.toContain("script-src");
  });
});

describe("isolated game surface", () => {
  const sources = cspRouteSources("game");
  const matching = (pathname: string) =>
    [...sources.wasm, sources.nonWasm].filter((source) =>
      getPathMatch(source, { removeUnnamedParams: true, strict: true })(pathname),
    );

  test("the root, rewritten to the Dragon Pixel world, gets the Wasm policy only", () => {
    expect(matching("/")).toEqual(["/"]);
  });

  test("every other path still gets exactly one rule, Wasm only on the Wasm routes", () => {
    for (const prefix of WASM_ROUTE_PREFIXES) {
      expect(matching(`${prefix}/sub`)).toHaveLength(1);
      expect(matching(`${prefix}/sub`)).not.toContain(sources.nonWasm);
    }
    for (const pathname of ["/wiki", "/games", "/games/bingo", "/_next/static/a.js"]) {
      expect(matching(pathname)).toEqual([sources.nonWasm]);
    }
  });

  test("the main site surface keeps the root without Wasm", () => {
    const site = cspRouteSources("site");
    expect(site.wasm).not.toContain("/");
    expect(
      getPathMatch(site.nonWasm, { removeUnnamedParams: true, strict: true })("/"),
    ).toBeTruthy();
  });
});
