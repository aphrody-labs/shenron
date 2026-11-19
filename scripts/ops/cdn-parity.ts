// SPDX-License-Identifier: Apache-2.0
// Parity check between the public CDN and Garage: samples N public paths from the pinned manifests and
// compares the sha256 of (a) the body served by the public origin, (b) the object `_objects/<sha256>` read
// from Garage over S3, (c) optionally the body served by the Garage-backed origin, and (d) the manifest.
//
//   bun scripts/ops/cdn-parity.ts [--samples N] [--public URL] [--origin URL] [--seed S]
//
// Environment: GARAGE_ACCESS_KEY_ID, GARAGE_SECRET_ACCESS_KEY (read-only key is enough), GARAGE_ENDPOINT
// (default: first active node of deploy/garage/cluster.toml on its mesh address).
import { createHash } from "node:crypto";
import { S3 } from "../../deploy/garage/s3";
import { loadCluster, meshAddresses } from "./garage-config";

interface ManifestEntry {
  sha256: string;
  size: number;
}

export function pick<T>(items: T[], count: number, seed: number): T[] {
  // Deterministic Fisher-Yates (mulberry32) so a failing sample can be replayed with the same --seed.
  const copy = [...items];
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, count);
}

async function sha256Of(response: Response) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body ?? []) {
    hash.update(chunk);
    bytes += chunk.byteLength;
  }
  return { sha256: hash.digest("hex"), bytes };
}

export async function main(argv = process.argv.slice(2)) {
  const flag = (name: string, fallback?: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  const cluster = await loadCluster();
  const mesh = await meshAddresses();
  const first = cluster.nodes.find((node) => node.status === "active")!;
  const samples = Number(flag("--samples", "50"));
  const publicOrigin = (flag("--public", cluster.serving.public_origin) ?? "").replace(/\/+$/, "");
  const origin = flag("--origin")?.replace(/\/+$/, "");
  const seed = Number(flag("--seed", String(Date.now() % 2 ** 31)));
  const garage = new S3({
    endpoint: process.env.GARAGE_ENDPOINT ?? `http://${mesh(first.triad)}:${cluster.ports.s3}`,
    region: process.env.GARAGE_REGION ?? cluster.garage.s3_region,
    accessKeyId: process.env.GARAGE_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.GARAGE_SECRET_ACCESS_KEY ?? "",
    bucket: cluster.bucket.name,
  });

  const catalogue: [string, ManifestEntry][] = [];
  for await (const shard of garage.list(cluster.serving.manifest_prefix)) {
    const response = await garage.get(shard.key);
    const entries = (await response!.json()) as Record<string, ManifestEntry>;
    for (const [path, entry] of Object.entries(entries)) catalogue.push([path, entry]);
  }
  const sample = pick(catalogue, samples, seed);
  const mismatches: Record<string, unknown>[] = [];
  let compared = 0;
  let bytes = 0;
  const encode = (path: string) => path.split("/").map(encodeURIComponent).join("/");
  const fetchBody = (url: string) =>
    fetch(url, {
      headers: { "accept-encoding": "identity" },
      redirect: "manual",
      signal: AbortSignal.timeout(120000),
    });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, sample.length) }, async () => {
      while (next < sample.length) {
        const [path, entry] = sample[next++]!;
        const result: Record<string, unknown> = { path, manifest: entry.sha256 };
        const pub = await fetchBody(`${publicOrigin}${encode(path)}`);
        const pubHash = pub.ok ? await sha256Of(pub) : undefined;
        result.public = pubHash?.sha256 ?? `HTTP ${pub.status}`;
        const object = await garage.get(`_objects/${entry.sha256}`);
        const objectHash = object ? await sha256Of(object) : undefined;
        result.garage = objectHash?.sha256 ?? "missing";
        if (origin) {
          const served = await fetchBody(`${origin}${encode(path)}`);
          const servedHash = served.ok ? await sha256Of(served) : undefined;
          result.origin = servedHash?.sha256 ?? `HTTP ${served.status}`;
        }
        compared++;
        bytes += objectHash?.bytes ?? 0;
        const values = [
          result.manifest,
          result.public,
          result.garage,
          ...(origin ? [result.origin] : []),
        ];
        if (new Set(values).size !== 1) mismatches.push(result);
      }
    }),
  );
  console.log(
    JSON.stringify({
      publicOrigin,
      originChecked: Boolean(origin),
      manifestPaths: catalogue.length,
      seed,
      sampled: sample.length,
      compared,
      bytes,
      mismatches: mismatches.length,
      mismatchSample: mismatches.slice(0, 5),
    }),
  );
  return mismatches.length ? 1 : 0;
}

if (import.meta.main) process.exit(await main());
