// SPDX-License-Identifier: Apache-2.0
// Export the open project's page results to Shenron as unreviewed manga candidates, through
// the editor commands (`get_pages`, `get_page_result`, `get_page_source_sha256`) of the
// engine the editor runs on (Tauri IPC or the local bridge).
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { commands, type PageSummary } from "@aphrody/shenron-koharu/protocol";
import {
  mapNativeKoharuPageResult,
  toMangaReviewCandidateInput,
  type KoharuMangaPageSource,
  type MangaCandidateBinding,
} from "@aphrody/shenron-pipeline/koharu";
import { parseKoharuCandidateReceipt } from "../lib/export-receipt";
import { ShenronAtlasPanel } from "./ShenronAtlasPanel";

/** @deprecated Ignored: the panel speaks the editor commands. Kept while hosts still pass it. */
export interface ShenronExportHost {
  isTauri(): boolean;
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T | null>;
}

interface Binding {
  mangaPageId: string;
  sourceSha256: string;
  image: string;
}

interface CatalogVolume {
  series: string;
  volume: string;
  pages: number;
}

interface CatalogPage {
  page: number;
  hasJa: boolean;
  lineCount: number;
  text?: string;
}

interface CatalogHit {
  series: string;
  tome: string;
  planche: number;
  lang: string;
  snippet?: string;
}

type Status =
  | { state: "idle" }
  | { state: "busy" }
  | { state: "done"; detail: string }
  | { state: "error"; detail: string };

type CatalogState = "loading" | "ready" | "empty" | "unavailable";

const fieldClass = "h-7 w-full rounded border border-border bg-transparent px-2 text-[11px]";

function mimeFor(image: string, t: (key: string) => string): KoharuMangaPageSource["mime"] {
  if (/\.jpe?g$/i.test(image)) return "image/jpeg";
  if (/\.png$/i.test(image)) return "image/png";
  if (/\.webp$/i.test(image)) return "image/webp";
  throw new Error(t("shenronExport.imageTypeUnsupported"));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ShenronExportPanel(_props: { host?: ShenronExportHost } = {}) {
  const { t } = useTranslation();
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [volumes, setVolumes] = useState<CatalogVolume[]>([]);
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");
  const [series, setSeries] = useState("DB");
  const [volume, setVolume] = useState("");
  const [catalogPages, setCatalogPages] = useState<CatalogPage[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [bindings, setBindings] = useState<Record<string, Binding>>({});
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setPages(await commands.getPages());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/local/koharu/catalog?series=${series}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { volumes?: CatalogVolume[] };
        if (!Array.isArray(body?.volumes)) throw new Error("Invalid manga catalog response");
        const next = body.volumes;
        setVolumes(next);
        setVolume((current) => (next.some((item) => item.volume === current) ? current : ""));
        setCatalogState(next.length ? "ready" : "empty");
      } catch {
        if (!controller.signal.aborted) {
          setVolumes([]);
          setVolume("");
          setCatalogState("unavailable");
        }
      }
    })();
    return () => controller.abort();
  }, [series]);

  useEffect(() => {
    if (!volume) return;
    const controller = new AbortController();
    void fetch(`/api/local/koharu/catalog?series=${series}&volume=${encodeURIComponent(volume)}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { pages?: CatalogPage[] } | null) => setCatalogPages(body?.pages ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [series, volume]);

  const selectCatalogTarget = (nextSeries: string, nextVolume: string) => {
    if (nextSeries === series && nextVolume === volume) return;
    if (nextSeries !== series) setCatalogState("loading");
    setSeries(nextSeries);
    setVolume(nextVolume);
    setCatalogPages([]);
    setStatuses({});
    setBindings((current) =>
      Object.fromEntries(
        Object.entries(current).map(([page, binding]) => [page, { ...binding, mangaPageId: "" }]),
      ),
    );
  };

  const searchCatalog = async () => {
    const value = query.trim();
    if (!value) {
      setHits([]);
      return;
    }
    try {
      const response = await fetch(
        `/api/local/koharu/search?q=${encodeURIComponent(value)}&series=${series}`,
      );
      const body = (await response.json()) as { results?: CatalogHit[] };
      setHits(response.ok ? (body.results ?? []) : []);
    } catch {
      setHits([]);
    }
  };

  const setBinding = (page: string, patch: Partial<Binding>) =>
    setBindings((current) => ({
      ...current,
      [page]: { ...(current[page] ?? { mangaPageId: "", sourceSha256: "", image: "" }), ...patch },
    }));

  const exportPage = async (page: PageSummary, binding: Binding) => {
    if (
      !catalogPages.some(
        (catalogPage) => `${series}:${volume}:${catalogPage.page}` === binding.mangaPageId.trim(),
      )
    ) {
      throw new Error(t("shenronExport.pageTargetRequired"));
    }
    const sourceSha256 = binding.sourceSha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sourceSha256)) {
      throw new Error(t("shenronExport.sourceHashInvalid"));
    }
    const image = binding.image.trim();
    if (!image) throw new Error(t("shenronExport.imageRequired"));
    const mime = mimeFor(image, t);
    const result = await commands.getPageResult(page.id);
    const sha256 = await commands.getPageSourceSha256(page.id);
    const manifest: MangaCandidateBinding = {
      id: binding.mangaPageId.trim(),
      sourceSha256,
      imageSha256: sha256,
      image,
    };
    const source: KoharuMangaPageSource = {
      kind: "manga",
      pageId: manifest.id,
      sourceSha256: manifest.sourceSha256,
      imageSha256: manifest.imageSha256,
      mime,
      width: page.size.width,
      height: page.size.height,
    };
    // The shared mapper hashes the cleanup layer with Bun.CryptoHasher, which the
    // webview lacks; hash it here with WebCrypto and map the rest unchanged.
    const cleanup = result.cleanup_layer_png;
    const mapped = mapNativeKoharuPageResult(
      { result: { ...result, cleanup_layer_png: null }, sourceSha256: sha256 },
      source,
    );
    if (Array.isArray(cleanup)) {
      mapped.artifacts = {
        cleanupOverlaySha256: await sha256Hex(Uint8Array.from(cleanup as number[])),
      };
    }
    const candidate = toMangaReviewCandidateInput(mapped, manifest);
    const response = await fetch("/api/local/koharu/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(candidate),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const receipt = parseKoharuCandidateReceipt(await response.json().catch(() => null));
    if (!receipt) throw new Error(t("shenronExport.receiptInvalid"));
    const status = t(`shenronExport.candidateStatus.${receipt.status}`);
    return receipt.created
      ? t("shenronExport.candidateCreated", { id: receipt.id, status })
      : t("shenronExport.candidateExisting", { id: receipt.id, status });
  };

  const exportAll = async () => {
    setRunning(true);
    setError(null);
    for (const page of pages) {
      const binding = bindings[page.id];
      if (!binding?.mangaPageId.trim()) continue;
      setStatuses((s) => ({ ...s, [page.id]: { state: "busy" } }));
      try {
        const detail = await exportPage(page, binding);
        setStatuses((s) => ({ ...s, [page.id]: { state: "done", detail } }));
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        setStatuses((s) => ({ ...s, [page.id]: { state: "error", detail } }));
      }
    }
    setRunning(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 text-[11px]">
      <ShenronAtlasPanel />
      <p className="rounded border border-border/80 bg-muted/20 p-2 text-[10px] leading-4 text-muted-foreground">
        {t("shenronExport.localDescription")}
      </p>
      <label className="grid gap-1">
        <span>{t("shenronExport.series")}</span>
        <select
          className={fieldClass}
          value={series}
          onChange={(event) => selectCatalogTarget(event.target.value, "")}
        >
          <option value="DB">{t("shenronExport.dragonBall")}</option>
          <option value="DBS">{t("shenronExport.dragonBallSuper")}</option>
        </select>
      </label>
      <p className="text-[10px] text-muted-foreground" aria-live="polite">
        {catalogState === "loading"
          ? t("shenronExport.catalogLoading")
          : catalogState === "ready"
            ? t("shenronExport.volumeCount", { count: volumes.length })
            : catalogState === "empty"
              ? t("shenronExport.emptyCatalog")
              : t("shenronExport.catalogUnavailable")}
      </p>
      <div className="grid gap-1">
        <span>{t("shenronExport.searchTitle")}</span>
        <div className="flex gap-1">
          <input
            className={`${fieldClass} min-w-0 flex-1`}
            value={query}
            placeholder={t("shenronExport.searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void searchCatalog();
            }}
          />
          <button
            type="button"
            className="h-7 rounded border border-border px-2"
            onClick={() => void searchCatalog()}
          >
            {t("shenronExport.search")}
          </button>
        </div>
        {hits.length ? (
          <ul className="grid gap-1 rounded border border-border/80 bg-muted/20 p-2 text-[10px]">
            {hits.slice(0, 5).map((hit) => (
              <li key={`${hit.series}:${hit.tome}:${hit.planche}`}>
                <button
                  type="button"
                  className="w-full truncate text-left hover:text-primary"
                  onClick={() => {
                    selectCatalogTarget(hit.series, hit.tome);
                  }}
                >
                  {hit.series}:{hit.tome}:{hit.planche} · {hit.snippet || hit.lang}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <label className="grid gap-1">
        <span>{t("shenronExport.targetVolume")}</span>
        <select
          className={fieldClass}
          value={volume}
          disabled={catalogState !== "ready"}
          onChange={(event) => {
            selectCatalogTarget(series, event.target.value);
          }}
        >
          <option value="">{t("shenronExport.selectVolume")}</option>
          {volumes.map((item) => (
            <option key={`${item.series}:${item.volume}`} value={item.volume}>
              {item.volume} · {t("shenronExport.pageCount", { count: item.pages })}
            </option>
          ))}
        </select>
      </label>
      {volume && catalogPages.length ? (
        <div className="grid gap-1 rounded border border-border/80 bg-muted/20 p-2 text-[10px]">
          <p className="text-muted-foreground">
            {t("shenronExport.pageMapping", {
              count: catalogPages.length,
              japanese: catalogPages.filter((page) => page.hasJa).length,
            })}
          </p>
          <ul className="grid gap-1">
            {catalogPages.slice(0, 6).map((page) => (
              <li key={page.page} className="flex items-center gap-2">
                <span className="w-8 shrink-0 font-mono">#{page.page}</span>
                <span className="min-w-0 flex-1 truncate">
                  {page.text?.trim() || t("shenronExport.noOcr")}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {page.hasJa
                    ? t("shenronExport.japaneseShort")
                    : t("shenronExport.noJapaneseShort")}{" "}
                  · {page.lineCount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex gap-1">
        <button
          type="button"
          className="h-7 flex-1 rounded border border-border"
          onClick={() => void refresh()}
          disabled={running}
        >
          {t("shenronExport.refresh")}
        </button>
        <button
          type="button"
          className="h-7 flex-1 rounded bg-primary text-primary-foreground"
          onClick={() => void exportAll()}
          disabled={running || !pages.some((page) => bindings[page.id]?.mangaPageId.trim())}
        >
          {t("shenronExport.export")}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <ul className="grid gap-2">
        {pages.map((page) => {
          const binding = bindings[page.id];
          const status = statuses[page.id] ?? { state: "idle" };
          return (
            <li key={page.id} className="grid gap-1 rounded border border-border/80 p-2">
              <div className="flex justify-between gap-2">
                <span className="truncate font-medium">{page.label}</span>
                <span data-state={status.state}>
                  {status.state === "idle"
                    ? t("shenronExport.statusIdle")
                    : status.state === "busy"
                      ? t("shenronExport.statusBusy")
                      : status.state === "done"
                        ? t("shenronExport.statusDone", { detail: status.detail })
                        : t("shenronExport.statusError")}
                </span>
              </div>
              <label className="grid gap-1">
                <span>{t("shenronExport.pageTarget", { page: page.label })}</span>
                <select
                  className={fieldClass}
                  value={binding?.mangaPageId ?? ""}
                  disabled={!catalogPages.length || !volume}
                  onChange={(event) => setBinding(page.id, { mangaPageId: event.target.value })}
                >
                  <option value="">{t("shenronExport.selectPage")}</option>
                  {catalogPages.map((catalogPage) => (
                    <option
                      key={catalogPage.page}
                      value={`${series}:${volume}:${catalogPage.page}`}
                    >
                      {t("shenronExport.pageOption", {
                        page: catalogPage.page,
                        language: catalogPage.hasJa
                          ? t("shenronExport.japaneseShort")
                          : t("shenronExport.noJapaneseShort"),
                      })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span>{t("shenronExport.sourceHash")}</span>
                <input
                  className={fieldClass}
                  placeholder={t("shenronExport.sourceHashPlaceholder")}
                  value={binding?.sourceSha256 ?? ""}
                  onChange={(event) => setBinding(page.id, { sourceSha256: event.target.value })}
                />
              </label>
              <label className="grid gap-1">
                <span>{t("shenronExport.manifestImage")}</span>
                <input
                  className={fieldClass}
                  placeholder={t("shenronExport.manifestImagePlaceholder")}
                  value={binding?.image ?? ""}
                  onChange={(event) => setBinding(page.id, { image: event.target.value })}
                />
              </label>
              {status.state === "error" && (
                <p className="break-words text-destructive">{status.detail}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
