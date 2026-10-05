// SPDX-License-Identifier: Apache-2.0
/**
 * Native router of the Shenron API: endpoint catalogue paths (`/api/public/wiki/{category}`)
 * compiled to `Bun.serve` route keys (`/api/public/wiki/:category`) and to a matcher for the
 * `fetch(request)` entry used when the API is embedded in another host (Next route handler,
 * tests, the bot's legacy server). Static routes win over parameterised ones, as in Bun.
 * Runtime class: `pure`.
 */

export type HttpMethod = "GET" | "HEAD" | "POST" | "OPTIONS";

export interface CompiledRoute<H> {
  /** Catalogue path (`{name}` parameters). */
  path: string;
  /** `Bun.serve` route key (`:name` parameters). */
  bunPath: string;
  method: Exclude<HttpMethod, "HEAD" | "OPTIONS">;
  handler: H;
}

/** `{name}` → `:name`. */
export function toBunPath(path: string): string {
  return path.replace(/\{(\w+)\}/g, ":$1");
}

interface Matcher<H> {
  route: CompiledRoute<H>;
  regex: RegExp;
  keys: string[];
  /** Number of literal segments (higher = more specific). */
  literals: number;
}

export class Router<H> {
  readonly #routes: CompiledRoute<H>[] = [];
  #matchers: Matcher<H>[] | null = null;

  add(path: string, method: CompiledRoute<H>["method"], handler: H): void {
    this.#routes.push({ path, bunPath: toBunPath(path), method, handler });
    this.#matchers = null;
  }

  get routes(): readonly CompiledRoute<H>[] {
    return this.#routes;
  }

  #compile(): Matcher<H>[] {
    if (this.#matchers) return this.#matchers;
    this.#matchers = this.#routes
      .map((route) => {
        const keys: string[] = [];
        const pattern = route.path
          .split("/")
          .map((segment) => {
            const param = /^\{(\w+)\}$/.exec(segment);
            if (param) {
              keys.push(param[1]!);
              return "([^/]+)";
            }
            return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          })
          .join("/");
        return {
          route,
          regex: new RegExp(`^${pattern}$`),
          keys,
          literals: route.path.split("/").filter((s) => s && !s.startsWith("{")).length,
        };
      })
      .toSorted((a, b) => a.keys.length - b.keys.length || b.literals - a.literals);
    return this.#matchers;
  }

  /** Routes of `pathname`, every method, best match first. */
  match(pathname: string): { route: CompiledRoute<H>; params: Record<string, string> }[] {
    const out: { route: CompiledRoute<H>; params: Record<string, string> }[] = [];
    for (const matcher of this.#compile()) {
      const found = matcher.regex.exec(pathname);
      if (!found) continue;
      const params: Record<string, string> = {};
      let valid = true;
      matcher.keys.forEach((key, index) => {
        try {
          params[key] = decodeURIComponent(found[index + 1]!);
        } catch {
          valid = false;
        }
      });
      if (valid) out.push({ route: matcher.route, params });
    }
    return out;
  }
}

// ── Server-sent events ──────────────────────────────────────────────────────

const encoder = new TextEncoder();

/** One SSE frame: `id:`, `event:` and a single-line JSON `data:`. */
export function sseFrame(event: string, data: unknown, id?: number | string): Uint8Array {
  const lines = [];
  if (id !== undefined) lines.push(`id: ${id}`);
  lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  return encoder.encode(`${lines.join("\n")}\n\n`);
}

/** SSE comment line keeping proxies from closing an idle stream. */
export const SSE_KEEPALIVE = encoder.encode(": keepalive\n\n");

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
