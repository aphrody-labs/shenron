// SPDX-License-Identifier: Apache-2.0
/**
 * Header diff between a reference nginx and shenron-edge for the same URLs (ADR 0009, step 3).
 *
 * Each URL is requested twice per target (the first request warms the cache, the second one is
 * compared) with `curl --resolve`, so the TLS name and the Host header stay the public host while
 * the connection goes to the given address. Differing headers are printed; the exit code is 1
 * when any URL differs.
 *
 *   bun scripts/ops/edge-header-diff.ts --host dragonballfr.com \
 *     --nginx 127.0.0.1:443 --edge 127.0.0.1:18443 --urls urls.txt
 */

export type HeaderMap = Map<string, string[]>;

/**
 * Headers expected to differ between two correct servers: per-response values (date, age, server,
 * cf-*, report-to, nel, alt-svc) and message framing (content-length, transfer-encoding), which
 * follows whether the upstream streamed or buffered that particular response.
 */
export const DEFAULT_IGNORE = [
  "date",
  "age",
  "server",
  "cf-*",
  "report-to",
  "nel",
  "alt-svc",
  "content-length",
  "transfer-encoding",
];

export interface Diff {
  name: string;
  nginx: string[];
  edge: string[];
}

/** Parse the last response block of a `curl -D -` dump into lowercase name to values. */
export function parseHeaders(dump: string): HeaderMap {
  const blocks = dump.split(/\r?\n\r?\n/).filter((block) => block.startsWith("HTTP/"));
  const last = blocks.at(-1) ?? "";
  const headers: HeaderMap = new Map();
  for (const line of last.split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers.set(name, [...(headers.get(name) ?? []), value]);
  }
  return headers;
}

export function statusOf(dump: string): string {
  const blocks = dump.split(/\r?\n\r?\n/).filter((block) => block.startsWith("HTTP/"));
  return blocks.at(-1)?.split(/\r?\n/)[0]?.split(" ")[1] ?? "000";
}

function ignored(name: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
  );
}

export function diffHeaders(
  nginx: HeaderMap,
  edge: HeaderMap,
  ignore: readonly string[] = DEFAULT_IGNORE,
): Diff[] {
  const names = new Set([...nginx.keys(), ...edge.keys()]);
  const out: Diff[] = [];
  for (const name of [...names].sort()) {
    if (ignored(name, ignore)) continue;
    const a = [...(nginx.get(name) ?? [])].sort();
    const b = [...(edge.get(name) ?? [])].sort();
    if (a.length !== b.length || a.some((value, i) => value !== b[i]))
      out.push({ name, nginx: a, edge: b });
  }
  return out;
}

async function fetchHeaders(
  host: string,
  target: string,
  path: string,
  extra: string[],
): Promise<{ status: string; headers: HeaderMap }> {
  const [address, port = "443"] = target.split(/:(?=[^:]*$)/);
  const scheme = port === "80" ? "http" : "https";
  const args = [
    "-sk",
    "-D",
    "-",
    "-o",
    "/dev/null",
    "--max-time",
    "30",
    "--resolve",
    `${host}:${port}:${address}`,
    ...extra.flatMap((header) => ["-H", header]),
    `${scheme}://${host}:${port}${path}`,
  ];
  const proc = Bun.spawn(["curl", ...args], { stdout: "pipe", stderr: "pipe" });
  const dump = await new Response(proc.stdout).text();
  await proc.exited;
  return { status: statusOf(dump), headers: parseHeaders(dump) };
}

function arg(name: string, fallback?: string): string | undefined {
  const index = Bun.argv.indexOf(`--${name}`);
  return index >= 0 ? Bun.argv[index + 1] : fallback;
}

async function main(): Promise<number> {
  const host = arg("host");
  const nginx = arg("nginx");
  const edge = arg("edge");
  const urls = arg("urls");
  if (!host || !nginx || !edge || !urls) {
    console.error(
      "usage: edge-header-diff.ts --host <name> --nginx <addr:port> --edge <addr:port> --urls <file> [--ignore a,b,cf-*] [--header 'Name: v'] [--attempts 3]",
    );
    return 2;
  }
  const ignore = [...DEFAULT_IGNORE, ...(arg("ignore")?.split(",") ?? [])];
  const extra = Bun.argv.flatMap((value, i) =>
    value === "--header" ? [Bun.argv[i + 1] ?? ""] : [],
  );
  const paths = (await Bun.file(urls).text())
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const attempts = Number(arg("attempts", "3"));
  let differing = 0;
  for (const path of paths) {
    for (const target of [nginx, edge]) await fetchHeaders(host, target, path, extra);
    // A page rendered per request can differ between two fetches of the same server (preload
    // links, build ids), so a URL passes when one of the attempts shows no difference.
    let last: { a: string; b: string; diffs: Diff[] } | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const [a, b] = await Promise.all([
        fetchHeaders(host, nginx, path, extra),
        fetchHeaders(host, edge, path, extra),
      ]);
      last = { a: a.status, b: b.status, diffs: diffHeaders(a.headers, b.headers, ignore) };
      if (!last.diffs.length && a.status === b.status) break;
    }
    if (last && !last.diffs.length && last.a === last.b) {
      console.log(`same  ${last.a} ${path}`);
      continue;
    }
    differing += 1;
    console.log(`DIFF  nginx=${last?.a} edge=${last?.b} ${path}`);
    for (const d of last?.diffs ?? [])
      console.log(
        `      ${d.name}\n        nginx: ${JSON.stringify(d.nginx)}\n        edge:  ${JSON.stringify(d.edge)}`,
      );
  }
  console.log(`\n${paths.length} urls, ${differing} differing, ignored: ${ignore.join(",")}`);
  return differing ? 1 : 0;
}

if (import.meta.main) process.exit(await main());
