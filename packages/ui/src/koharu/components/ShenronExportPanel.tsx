// SPDX-License-Identifier: Apache-2.0
// Export the open project's page results to Shenron as unreviewed manga candidates, through
// the editor commands (`get_pages`, `get_page_result`, `get_page_source_sha256`) of the
// engine the editor runs on (Tauri IPC or the local bridge).
import { useEffect, useState, useCallback } from "react";
import { commands, type PageSummary } from "@aphrody/shenron-koharu/protocol";
import {
  mapNativeKoharuPageResult,
  toMangaReviewCandidateInput,
  type KoharuMangaPageSource,
  type MangaCandidateBinding,
} from "@aphrody/shenron-pipeline/koharu";

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

type Status =
  | { state: "idle" }
  | { state: "busy" }
  | { state: "done"; detail: string }
  | { state: "error"; detail: string };

const fieldClass = "h-7 w-full rounded border border-border bg-transparent px-2 text-[11px]";

function mimeFor(image: string): KoharuMangaPageSource["mime"] {
  if (/\.jpe?g$/i.test(image)) return "image/jpeg";
  if (/\.png$/i.test(image)) return "image/png";
  if (/\.webp$/i.test(image)) return "image/webp";
  throw new Error("image path needs a .jpg, .png or .webp extension");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ShenronExportPanel(_props: { host?: ShenronExportHost } = {}) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [volumes, setVolumes] = useState<CatalogVolume[]>([]);
  const [series, setSeries] = useState("DB");
  const [volume, setVolume] = useState("");
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
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/local/koharu/catalog?series=${series}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { volumes?: CatalogVolume[] } | null) => {
        const next = body?.volumes ?? [];
        setVolumes(next);
        setVolume((current) => (next.some((item) => item.volume === current) ? current : ""));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [series]);

  const setBinding = (page: string, patch: Partial<Binding>) =>
    setBindings((current) => ({
      ...current,
      [page]: { ...(current[page] ?? { mangaPageId: "", sourceSha256: "", image: "" }), ...patch },
    }));

  const exportPage = async (page: PageSummary, binding: Binding) => {
    const result = await commands.getPageResult(page.id);
    const sha256 = await commands.getPageSourceSha256(page.id);
    const manifest: MangaCandidateBinding = {
      id: binding.mangaPageId.trim(),
      sourceSha256: binding.sourceSha256.trim().toLowerCase(),
      imageSha256: sha256,
      image: binding.image.trim(),
    };
    const source: KoharuMangaPageSource = {
      kind: "manga",
      pageId: manifest.id,
      sourceSha256: manifest.sourceSha256,
      imageSha256: manifest.imageSha256,
      mime: mimeFor(manifest.image),
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
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    return `HTTP ${response.status}`;
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
      <p className="rounded border border-border/80 bg-muted/20 p-2 text-[10px] leading-4 text-muted-foreground">
        Les candidats sont envoyés au catalogue Shenron local avec l’authentification du serveur.
      </p>
      <label className="grid gap-1">
        <span>Série Dragon Ball</span>
        <select
          className={fieldClass}
          value={series}
          onChange={(event) => setSeries(event.target.value)}
        >
          <option value="DB">Dragon Ball</option>
          <option value="DBS">Dragon Ball Super</option>
        </select>
      </label>
      <p className="text-[10px] text-muted-foreground">
        {volumes.length
          ? `${volumes.length} tome(s) disponibles dans le catalogue.`
          : "Catalogue indisponible ou vide."}
      </p>
      <label className="grid gap-1">
        <span>Tome cible</span>
        <select
          className={fieldClass}
          value={volume}
          disabled={!volumes.length}
          onChange={(event) => {
            const next = event.target.value;
            setVolume(next);
            if (!next) return;
            setBindings((current) => {
              const updated = { ...current };
              for (const [index, page] of pages.entries()) {
                updated[page.id] = {
                  ...(updated[page.id] ?? { sourceSha256: "", image: "" }),
                  mangaPageId: `${series}:${next}:${index + 1}`,
                };
              }
              return updated;
            });
          }}
        >
          <option value="">Sélectionner un tome…</option>
          {volumes.map((item) => (
            <option key={`${item.series}:${item.volume}`} value={item.volume}>
              {item.volume} · {item.pages} pages
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-1">
        <button
          type="button"
          className="h-7 flex-1 rounded border border-border"
          onClick={() => void refresh()}
          disabled={running}
        >
          Actualiser
        </button>
        <button
          type="button"
          className="h-7 flex-1 rounded bg-primary text-primary-foreground"
          onClick={() => void exportAll()}
          disabled={running || pages.length === 0}
        >
          Exporter
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
                    ? "—"
                    : status.state === "busy"
                      ? "…"
                      : status.state === "done"
                        ? `OK ${status.detail}`
                        : "Erreur"}
                </span>
              </div>
              <input
                className={fieldClass}
                placeholder="ID page manga"
                value={binding?.mangaPageId ?? ""}
                onChange={(e) => setBinding(page.id, { mangaPageId: e.currentTarget.value })}
              />
              <input
                className={fieldClass}
                placeholder="sourceSha256 (manifeste)"
                value={binding?.sourceSha256 ?? ""}
                onChange={(e) => setBinding(page.id, { sourceSha256: e.currentTarget.value })}
              />
              <input
                className={fieldClass}
                placeholder="image (manifeste)"
                value={binding?.image ?? ""}
                onChange={(e) => setBinding(page.id, { image: e.currentTarget.value })}
              />
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
