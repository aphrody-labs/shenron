// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/T";
import {
  initShenronReWeb,
  parseGameDataFile,
  SHENRON_RE_WASM_FILENAME,
  type GameDataFileResult,
  type GameDataFormat,
} from "@aphrody/shenron-pipeline/re-wasm-web";

type CpkRecord = { name: string; size: number; mtime: string };
type CpkEntry = {
  cpk: string;
  path: string;
  offset: number;
  size: number;
  extract_size: number;
  compressed: boolean;
};
type CpkIndex = { total: number; offset: number; limit: number; entries: CpkEntry[] };
type EntryResult = {
  path: string;
  result?: GameDataFileResult;
  error?: "unsupported" | "oversize" | "invalid";
};

const API_PATH = "/api/public/dbxv2/cpk";
const MAX_ANALYZE_BYTES = 16 * 1024 * 1024;
const FORMATS = new Set<GameDataFormat>(["bac", "bdm", "cus", "msg", "pup"]);
const ERROR_KEYS = {
  unsupported: "communaute.jeux.xenoverse.cpkUnsupported",
  oversize: "communaute.jeux.xenoverse.cpkOversize",
  invalid: "communaute.jeux.xenoverse.cpkInvalid",
} as const;

function cdnUrl(path: string): string {
  const cdn = process.env.NEXT_PUBLIC_CDN_URL?.trim().replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" && cdn ? `${cdn}${path}` : path;
}

function apiUrl(path = ""): string {
  return cdnUrl(`${API_PATH}${path}`);
}

function wasmUrl(): string {
  return cdnUrl(`/wasm/${SHENRON_RE_WASM_FILENAME}`);
}

function formatFor(path: string): GameDataFormat | undefined {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return extension && FORMATS.has(extension as GameDataFormat)
    ? (extension as GameDataFormat)
    : undefined;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} Go`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} Mio`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} Kio`;
  return `${bytes} o`;
}

function entryUrl(cpk: string, path: string): string {
  const segments = [cpk, "raw", ...path.split("/")].map(encodeURIComponent);
  return apiUrl(`/${segments.join("/")}`);
}

export function Dbxv2CpkExplorer() {
  const t = useT();
  const [catalog, setCatalog] = useState<CpkRecord[]>([]);
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("ext:bac");
  const [index, setIndex] = useState<CpkIndex | null>(null);
  const [indexState, setIndexState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [entryResults, setEntryResults] = useState<Record<string, EntryResult>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(apiUrl(), { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog unavailable");
        return (await response.json()) as CpkRecord[];
      })
      .then((records) => {
        if (!active) return records;
        setCatalog(records);
        setSelected(records[0]?.name ?? "");
        setCatalogState("ready");
        return records;
      })
      .catch(() => {
        if (active) setCatalogState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadIndex(name = selected, search = query) {
    if (!name) return;
    setIndexState("loading");
    setEntryResults({});
    try {
      const params = new URLSearchParams({ q: search, limit: "100", offset: "0" });
      const response = await fetch(apiUrl(`/${encodeURIComponent(name)}/find?${params}`), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("index unavailable");
      setIndex((await response.json()) as CpkIndex);
      setIndexState("ready");
    } catch {
      setIndex(null);
      setIndexState("error");
    }
  }

  async function analyzeEntry(entry: CpkEntry) {
    if (analyzing !== null) return;
    const format = formatFor(entry.path);
    if (!format) {
      setEntryResults((current) => ({
        ...current,
        [entry.path]: { path: entry.path, error: "unsupported" },
      }));
      return;
    }
    if (entry.extract_size > MAX_ANALYZE_BYTES) {
      setEntryResults((current) => ({
        ...current,
        [entry.path]: { path: entry.path, error: "oversize" },
      }));
      return;
    }
    setAnalyzing(entry.path);
    try {
      await initShenronReWeb(wasmUrl());
      const response = await fetch(entryUrl(entry.cpk, entry.path));
      if (!response.ok) throw new Error("entry unavailable");
      const contentLength = Number(response.headers.get("content-length"));
      if (contentLength > MAX_ANALYZE_BYTES) throw new Error("entry too large");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_ANALYZE_BYTES) throw new Error("entry too large");
      const result = parseGameDataFile(format, bytes);
      setEntryResults((current) => ({ ...current, [entry.path]: { path: entry.path, result } }));
    } catch {
      setEntryResults((current) => ({
        ...current,
        [entry.path]: {
          path: entry.path,
          error: entry.extract_size > MAX_ANALYZE_BYTES ? "oversize" : "invalid",
        },
      }));
    } finally {
      setAnalyzing(null);
    }
  }

  const selectedRecord = catalog.find((record) => record.name === selected);

  return (
    <section
      className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-5 sm:p-6"
      aria-labelledby="xv2-cpk-title"
    >
      <div>
        <h2 id="xv2-cpk-title" className="font-display text-xl font-bold text-white">
          {t("communaute.jeux.xenoverse.cpkTitle")}
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/70">
          {t("communaute.jeux.xenoverse.cpkDescription")}
        </p>
      </div>

      {catalogState === "loading" && (
        <output className="text-sm text-white/70">
          {t("communaute.jeux.xenoverse.cpkLoading")}
        </output>
      )}
      {catalogState === "unavailable" && (
        <output className="text-sm text-white/60">
          {t("communaute.jeux.xenoverse.cpkUnavailable")}
        </output>
      )}

      {catalogState === "ready" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1 text-sm text-white/80">
              {t("communaute.jeux.xenoverse.cpkArchive")}
              <select
                value={selected}
                onChange={(event) => {
                  setSelected(event.currentTarget.value);
                  setIndex(null);
                  setIndexState("idle");
                }}
                className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-white"
              >
                {catalog.map((record) => (
                  <option key={record.name} value={record.name}>
                    {record.name}.cpk · {formatSize(record.size)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-56 flex-1 text-sm text-white/80">
              {t("communaute.jeux.xenoverse.cpkSearchLabel")}
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadIndex();
                }}
                className="mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-black/40 px-3 text-white"
                maxLength={200}
              />
            </label>
            <button
              type="button"
              className="min-h-11 rounded-lg bg-dbz-orange px-4 font-semibold text-black"
              onClick={() => void loadIndex()}
              disabled={!selected || indexState === "loading"}
            >
              {indexState === "loading"
                ? t("communaute.jeux.xenoverse.cpkLoading")
                : t("communaute.jeux.xenoverse.cpkSearch")}
            </button>
          </div>

          {selectedRecord && (
            <p className="text-xs text-white/55">
              {t("communaute.jeux.xenoverse.cpkArchiveSize", {
                size: formatSize(selectedRecord.size),
              })}
            </p>
          )}
          {indexState === "error" && (
            <p role="alert" className="text-sm text-red-300">
              {t("communaute.jeux.xenoverse.cpkError")}
            </p>
          )}
          {index && (
            <>
              <p className="text-sm text-white/70">
                {t("communaute.jeux.xenoverse.cpkResults", { count: index.total })}
              </p>
              {index.entries.length === 0 ? (
                <p className="text-sm text-white/60">
                  {t("communaute.jeux.xenoverse.cpkNoResults")}
                </p>
              ) : (
                <ul className="max-h-[36rem] space-y-2 overflow-auto">
                  {index.entries.map((entry) => {
                    const item = entryResults[entry.path];
                    return (
                      <li
                        key={`${entry.cpk}/${entry.path}`}
                        className="rounded-lg border border-white/10 bg-black/25 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="break-all font-mono text-xs text-white/85">
                              {entry.path}
                            </p>
                            <p className="mt-1 text-xs text-white/50">
                              {formatSize(entry.extract_size)}
                              {entry.compressed
                                ? ` · ${t("communaute.jeux.xenoverse.cpkCompressed")}`
                                : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="min-h-10 rounded-lg border border-white/20 px-3 text-sm text-white hover:bg-white/10"
                            onClick={() => void analyzeEntry(entry)}
                            disabled={analyzing !== null}
                          >
                            {analyzing === entry.path
                              ? t("communaute.jeux.xenoverse.cpkLoading")
                              : t("communaute.jeux.xenoverse.cpkAnalyze")}
                          </button>
                        </div>
                        {item?.error && (
                          <output className="mt-2 text-xs text-amber-200">
                            {t(ERROR_KEYS[item.error])}
                          </output>
                        )}
                        {item?.result && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-sm text-dbz-green">
                              {t("communaute.jeux.xenoverse.cpkDecoded", {
                                format: item.result.format.toUpperCase(),
                                count: item.result.recordCount,
                              })}
                            </summary>
                            <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-black/35 p-3 text-xs leading-relaxed text-white/75">
                              {JSON.stringify(item.result.preview, null, 2)}
                            </pre>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
