// SPDX-License-Identifier: Apache-2.0
"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useT } from "@/components/T";
import { BTN_PRIMARY, PANEL } from "@/components/games/planche";
import {
  initShenronReWeb,
  parseGameDataFile,
  SHENRON_RE_WASM_FILENAME,
  type GameDataFileResult,
  type GameDataFormat,
} from "@shenron/pipeline/re-wasm-web";

const FORMATS = new Set<GameDataFormat>(["bac", "bdm", "cus", "msg", "pup"]);
const MAX_FILE_BYTES = 16 * 1024 * 1024;

type FileReport = {
  name: string;
  bytes: number;
  result?: GameDataFileResult;
  error?: string;
};

function formatFor(name: string): GameDataFormat | undefined {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return extension && FORMATS.has(extension as GameDataFormat)
    ? (extension as GameDataFormat)
    : undefined;
}

function wasmUrl(): string {
  const path = `/wasm/${SHENRON_RE_WASM_FILENAME}`;
  const cdn = process.env.NEXT_PUBLIC_CDN_URL?.trim().replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" && cdn ? `${cdn}/site${path}` : path;
}

export default function Xenoverse2Explorer() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [reports, setReports] = useState<FileReport[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ignoredCount, setIgnoredCount] = useState(0);

  async function analyze(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;

    const supported = files.flatMap((file) => {
      const format = formatFor(file.name);
      return format ? [{ file, format }] : [];
    });
    setReports([]);
    setIgnoredCount(files.length - supported.length);
    setError("");
    if (!supported.length) {
      setError(t("communaute.jeux.xenoverse.noSupported"));
      return;
    }

    setBusy(true);
    setProgress({ done: 0, total: supported.length });
    const next: FileReport[] = [];
    try {
      await initShenronReWeb(wasmUrl());
      for (let index = 0; index < supported.length; index += 1) {
        const { file, format } = supported[index]!;
        if (file.size > MAX_FILE_BYTES) {
          next.push({ name: file.webkitRelativePath || file.name, bytes: file.size, error: "oversize" });
        } else {
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const result = parseGameDataFile(format, bytes);
            next.push({ name: file.webkitRelativePath || file.name, bytes: file.size, result });
          } catch {
            next.push({ name: file.webkitRelativePath || file.name, bytes: file.size, error: "invalid" });
          }
        }
        if (index % 8 === 7 || index === supported.length - 1) {
          setReports([...next]);
          setProgress({ done: index + 1, total: supported.length });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
    } catch {
      setError(t("communaute.jeux.xenoverse.engineError"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function chooseDirectory() {
    const element = input.current;
    if (!element) return;
    element.setAttribute("webkitdirectory", "");
    element.click();
  }

  const parsedCount = reports.filter((report) => report.result).length;
  const recordCount = reports.reduce((total, report) => total + (report.result?.recordCount ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className={`${PANEL} space-y-4 p-5 sm:p-6`} aria-labelledby="xv2-local-title">
        <div>
          <h2 id="xv2-local-title" className="font-display text-xl font-bold text-white">
            {t("communaute.jeux.xenoverse.localTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/75">
            {t("communaute.jeux.xenoverse.localDescription")}
          </p>
        </div>
        <input
          ref={input}
          className="sr-only"
          type="file"
          multiple
          onChange={(event) => void analyze(event)}
          aria-label={t("communaute.jeux.xenoverse.chooseFolder")}
        />
        <button type="button" className={BTN_PRIMARY} onClick={chooseDirectory} disabled={busy}>
          {busy ? t("communaute.jeux.xenoverse.scanning") : t("communaute.jeux.xenoverse.chooseFolder")}
        </button>
        <p className="text-xs leading-relaxed text-white/55">
          {t("communaute.jeux.xenoverse.privacy")}
        </p>
        {progress && (
          <p role="status" aria-live="polite" className="text-sm text-white/75">
            {t("communaute.jeux.xenoverse.progress", progress)}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      </section>

      {reports.length > 0 && (
        <section className={`${PANEL} p-5 sm:p-6`} aria-labelledby="xv2-results-title">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="xv2-results-title" className="font-display text-xl font-bold text-white">
              {t("communaute.jeux.xenoverse.results")}
            </h2>
            <p className="text-sm tabular-nums text-white/70">
              {t("communaute.jeux.xenoverse.summary", { files: parsedCount, records: recordCount })}
            </p>
          </div>
          {ignoredCount > 0 && (
            <p className="mb-4 text-sm text-white/60">
              {t("communaute.jeux.xenoverse.ignored", { count: ignoredCount })}
            </p>
          )}
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={`${report.name}:${report.bytes}`} className="rounded-lg border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="break-all font-mono text-sm font-semibold text-white">{report.name}</h3>
                  {report.result ? (
                    <span className="text-sm text-dbz-green">
                      {t("communaute.jeux.xenoverse.fileResult", {
                        format: report.result.format.toUpperCase(),
                        count: report.result.recordCount,
                      })}
                    </span>
                  ) : (
                    <span className="text-sm text-amber-200">
                      {t(`communaute.jeux.xenoverse.${report.error ?? "invalid"}`)}
                    </span>
                  )}
                </div>
                {report.result && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-white/65">
                      {t("communaute.jeux.xenoverse.preview", { count: report.result.preview.length })}
                    </summary>
                    <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-black/35 p-3 text-xs leading-relaxed text-white/75">
                      {JSON.stringify(report.result.preview, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
