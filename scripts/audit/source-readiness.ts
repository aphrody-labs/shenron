/** Read-only production evidence; dependency health never proves corpus completeness. */
export type VolumeEvidence = {
  id: number;
  status: number;
  series?: string;
  number?: number;
  pages: number;
  sampledAssets: Array<{ url: string; status: number; image: boolean }>;
  error?: string;
};
export function assessSoshuhen(volumes: VolumeEvidence[]) {
  const missing = Array.from({ length: 18 }, (_, i) => i + 1).filter(
    (number) =>
      !volumes.some(
        (v) =>
          v.number === number &&
          v.status === 200 &&
          (v.series === "SOSH" || v.series === "DB_SOSH"),
      ),
  );
  const empty = volumes.filter((v) => v.pages === 0).map((v) => v.id);
  const inaccessible = volumes
    .filter(
      (v) =>
        v.pages > 0 &&
        (v.sampledAssets.length === 0 ||
          v.sampledAssets.some((a) => !a.image || a.status < 200 || a.status >= 300)),
    )
    .map((v) => v.id);
  return {
    status: missing.length || empty.length || inaccessible.length ? "incomplete" : "unknown",
    missingVolumes: missing,
    emptyVolumes: empty,
    inaccessibleVolumes: inaccessible,
    reason:
      "Printed page totals, every asset, OCR and RAG provenance require an authoritative inventory; samples cannot prove completeness.",
  };
}
export type AuditOptions = { allAssets?: boolean; concurrency?: number; deadlineMs?: number };
export async function auditSourceReadiness(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  options: AuditOptions = {},
) {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + Math.max(1, options.deadlineMs ?? 180000);
  const concurrency = Math.max(1, Math.min(8, Math.trunc(options.concurrency ?? 4)));
  const signal = () => AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now())));
  const origin = new URL(baseUrl);
  if (!/^https?:$/.test(origin.protocol)) throw new Error("HTTP(S) base URL required");
  const read = async (path: string) => {
    if (Date.now() >= deadline) throw new Error("Audit deadline exceeded");
    const response = await fetcher(new URL(path, origin), {
      signal: signal(),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  };
  const volumes: VolumeEvidence[] = [];
  for (let id = 701; id <= 718; id++) {
    try {
      const v = await read("/api/manga/volume/" + id);
      let pageCount = 0;
      const sampledAssets: VolumeEvidence["sampledAssets"] = [];
      for (const chapter of v.chapters ?? []) {
        const detail = await read("/api/manga/chapter/" + chapter.id);
        const list = Array.isArray(detail.pageList) ? detail.pageList : [];
        pageCount += list.length;
        const selected = options.allAssets
          ? list
          : [list[0], list.at(-1)].filter((p, i, a) => p && a.indexOf(p) === i);
        const results: VolumeEvidence["sampledAssets"] = [];
        let cursor = 0;
        await Promise.all(
          Array.from({ length: Math.min(concurrency, selected.length) }, async () => {
            while (cursor < selected.length) {
              const index = cursor++;
              const url = new URL(selected[index].image, origin).href;
              if (Date.now() >= deadline) {
                results[index] = { url, status: 0, image: false };
                continue;
              }
              try {
                const r = await fetcher(url, {
                  signal: signal(),
                  headers: { Range: "bytes=0-511" },
                  cache: "no-store",
                });
                results[index] = {
                  url: r.url || url,
                  status: r.status,
                  image: Boolean(r.headers.get("content-type")?.startsWith("image/")),
                };
                await r.body?.cancel();
              } catch {
                results[index] = { url, status: 0, image: false };
              }
            }
          }),
        );
        sampledAssets.push(...results);
      }
      volumes.push({
        id,
        status: 200,
        series: v.series,
        number: v.volume_number,
        pages: pageCount,
        sampledAssets,
      });
    } catch (error) {
      volumes.push({ id, status: 0, pages: 0, sampledAssets: [], error: String(error) });
    }
  }
  let health: unknown;
  try {
    health = await read("/api/health/ready");
  } catch (error) {
    health = { error: String(error) };
  }
  return {
    startedAt,
    measuredAt: new Date().toISOString(),
    assetAudit: {
      mode: options.allAssets ? "all-listed-assets" : "first-and-last-samples",
      concurrency,
      deadlineMs: options.deadlineMs ?? 180000,
      deadlineExceeded: Date.now() >= deadline,
      freshRequests: true,
      completeFileHashes: "not-measured",
    },
    baseUrl: origin.href,
    health,
    soshuhen: { ...assessSoshuhen(volumes), volumes },
    otherFamilies: Object.fromEntries(
      ["kai-dragon-book", "full-color", "weekly-shonen-jump", "interviews"].map((family) => [
        family,
        {
          status: "unknown",
          reason:
            "No exhaustive authoritative inventory and page/RAG provenance measured by this audit.",
        },
      ]),
    ),
    productionReady: false,
  };
}
if (import.meta.main) {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const report = await auditSourceReadiness(positional[0] ?? "https://dragonballfr.com", fetch, {
    allAssets: args.includes("--all-assets"),
  });
  const output = positional[1];
  if (output) await Bun.write(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      output
        ? {
            output,
            status: report.soshuhen.status,
            assetAudit: report.assetAudit,
            volumes: report.soshuhen.volumes.map((v) => ({
              id: v.id,
              pages: v.pages,
              checkedAssets: v.sampledAssets.length,
              accessibleAssets: v.sampledAssets.filter(
                (a) => a.image && a.status >= 200 && a.status < 300,
              ).length,
            })),
          }
        : report,
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
