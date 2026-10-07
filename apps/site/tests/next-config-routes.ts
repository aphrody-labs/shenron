/**
 * Les règles `redirects()` et `rewrites()` de `next.config.ts`, appliquées comme Next les
 * applique : même moteur de motifs (`getPathMatch`) et même construction de la
 * destination (`prepareDestination`, requête d'origine fusionnée). Sert aux tests des
 * anciennes adresses françaises (`english-routes`, `api-aliases`).
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination";
import config from "../next.config";

const nextConfig = config("phase-test");

interface Rule {
  source: string;
  destination: string;
  has?: unknown;
  missing?: unknown;
}

const redirects = (await nextConfig.redirects?.()) ?? [];
const rawRewrites = await nextConfig.rewrites?.();
const beforeFiles: Rule[] = Array.isArray(rawRewrites) ? [] : (rawRewrites?.beforeFiles ?? []);

/** Première règle qui s'applique à `url` (chemin et requête) : adresse produite, sinon `null`. */
function applyFirst(rules: readonly Rule[], url: string): string | null {
  const parsed = new URL(url, "http://site.test");
  const query = Object.fromEntries(parsed.searchParams);
  for (const rule of rules) {
    if (rule.has || rule.missing) continue;
    const params = getPathMatch(rule.source, { removeUnnamedParams: true, strict: true })(
      parsed.pathname,
    );
    if (!params) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: rule.destination,
      params,
      query,
    });
    const search = new URLSearchParams(
      parsedDestination.query as Record<string, string>,
    ).toString();
    return `${parsedDestination.pathname}${search ? `?${search}` : ""}`;
  }
  return null;
}

/** Adresse finale d'une suite de 308 de `redirects()` (au plus quatre sauts). */
export function followRedirects(url: string): { target: string; hops: number } {
  let current = url;
  for (let hops = 0; hops < 5; hops++) {
    const next = applyFirst(redirects as Rule[], current);
    if (next === null) return { target: current, hops };
    current = next;
  }
  throw new Error(`boucle de redirections depuis ${url}`);
}

/** Chemin servi par un `rewrite` `beforeFiles`, sinon `null`. */
export function rewriteOf(url: string): string | null {
  return applyFirst(beforeFiles, url);
}

const APP_DIR = fileURLToPath(new URL("../src/app/", import.meta.url));

/** Routes (`page.tsx`, `route.ts`) de `src/app`, groupes `(…)` et slots `@…` retirés. */
export function appRoutes(): { route: string; file: string }[] {
  const out: { route: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^(page|route)\.tsx?$/.test(name)) {
        const segments = relative(APP_DIR, dir)
          .split(/[\\/]/)
          .filter((s) => s && !/^\(.+\)$/.test(s) && !s.startsWith("@"));
        out.push({ route: `/${segments.join("/")}`, file: full });
      }
    }
  };
  walk(APP_DIR);
  return out;
}

/**
 * La route de `src/app` qui sert `pathname`, la plus précise d'abord (segments fixes, puis
 * dynamiques, le catch-all en dernier), sinon `null`.
 */
export function servingRoute(pathname: string): string | null {
  const parts = pathname.split("?")[0]!.split("/").filter(Boolean);
  const matches: { route: string; score: number }[] = [];
  for (const { route } of appRoutes()) {
    const segs = route.split("/").filter(Boolean);
    let score = 0;
    let ok = true;
    for (let i = 0; i < segs.length && ok; i++) {
      const seg = segs[i]!;
      if (seg.startsWith("[[...")) {
        score -= 1000;
        break;
      }
      if (seg.startsWith("[...")) {
        ok = parts.length > i;
        score -= 1000;
        break;
      }
      if (i >= parts.length) ok = false;
      else if (seg.startsWith("[")) score += 1;
      else if (seg === parts[i]) score += 10;
      else ok = false;
      if (ok && i === segs.length - 1 && parts.length !== segs.length) ok = false;
    }
    if (segs.length === 0 && parts.length > 0) ok = false;
    if (ok) matches.push({ route, score });
  }
  return matches.toSorted((x, y) => y.score - x.score)[0]?.route ?? null;
}
