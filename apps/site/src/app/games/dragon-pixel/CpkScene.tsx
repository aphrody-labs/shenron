// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import { useLangue } from "@/lib/i18n/client";
import { createGlbScene, type GlbSceneRenderer } from "@aphrody/shenron-engine/glb-scene";
import {
  initShenronReWeb,
  parseMessageFile,
  SHENRON_RE_WASM_FILENAME,
} from "@aphrody/shenron-pipeline/re-wasm-web";
import fr from "../../../../messages/dragon-pixel-scene/fr.json";
import en from "../../../../messages/dragon-pixel-scene/en.json";
import ja from "../../../../messages/dragon-pixel-scene/ja.json";
import CharacterScene from "./CharacterScene";
import DuelScene from "./DuelScene";
import {
  fetchBytes,
  messageLines,
  messagePage,
  MESSAGE_PAGE_SIZE,
  sceneUrl,
  SCENE_EXTENSIONS,
  type SceneKind,
  type SceneEntry,
  type SceneIndex,
} from "./cpk-scene";

const dictionaries = { fr, en, ja };
const inputClass = "min-h-11 rounded border border-white/25 bg-slate-950 px-3 text-white";

function ModelScene({ src, text }: { src: string; text: typeof fr }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<GlbSceneRenderer | null>(null);
  const [result, setResult] = useState<{ src: string; phase: "ready" | "error" } | null>(null);
  const state = result?.src === src ? result.phase : "loading";
  const [camera, setCamera] = useState({ rotation: 0, elevation: 0.15, zoom: 1 });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const controller = new AbortController();
    let handle: GlbSceneRenderer | null = null;
    let frame = 0;
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(element.clientWidth * ratio));
      element.height = Math.max(1, Math.round(element.clientHeight * ratio));
      handle?.resize(element.width, element.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    void (async () => {
      try {
        const bytes = await fetchBytes(src, controller.signal);
        if (controller.signal.aborted) return;
        handle = await createGlbScene(element, bytes);
        if (controller.signal.aborted) {
          handle.free();
          handle = null;
          return;
        }
        renderer.current = handle;
        setResult({ src, phase: "ready" });
        const draw = (time: number) => {
          if (controller.signal.aborted || !handle) return;
          if (!document.hidden && !handle.frame(time / 1000, 0, 0)) {
            setResult({ src, phase: "error" });
            return;
          }
          frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
      } catch {
        if (!controller.signal.aborted) setResult({ src, phase: "error" });
      }
    })();
    return () => {
      controller.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      handle?.free();
      renderer.current = null;
    };
  }, [src]);
  useEffect(() => {
    if (state === "ready") renderer.current?.camera(camera.rotation, camera.elevation, camera.zoom);
  }, [camera, state]);
  return (
    <section className="space-y-3">
      <canvas
        ref={canvas}
        className="h-[55vh] min-h-72 w-full rounded-xl bg-slate-950"
        aria-label={text.model}
      />
      {state !== "ready" && <output>{state === "loading" ? text.loading : text.gpu}</output>}
      <div className="grid gap-4 sm:grid-cols-3">
        {(["rotation", "elevation", "zoom"] as const).map((key) => (
          <label key={key} className="grid gap-2">
            {text[key]}
            <input
              type="range"
              min={key === "zoom" ? 0.5 : key === "rotation" ? -Math.PI : -1.4}
              max={key === "zoom" ? 3 : key === "rotation" ? Math.PI : 1.4}
              step="0.01"
              value={camera[key]}
              disabled={state !== "ready"}
              onChange={(event) =>
                setCamera({ ...camera, [key]: Number(event.currentTarget.value) })
              }
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function Dialogue({ src, text }: { src: string; text: typeof fr }) {
  const [page, setPage] = useState({ src, offset: 0 });
  const offset = page.src === src ? page.offset : 0;
  const [result, setResult] = useState<{ src: string; lines: string[]; error: boolean } | null>(
    null,
  );
  const lines = result?.src === src ? result.lines : null;
  const error = result?.src === src && result.error;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const bytes = await fetchBytes(src, controller.signal);
        await initShenronReWeb(`/wasm/${SHENRON_RE_WASM_FILENAME}`);
        if (!controller.signal.aborted)
          setResult({
            src,
            lines: messageLines(parseMessageFile(bytes).entries),
            error: false,
          });
      } catch {
        if (!controller.signal.aborted) setResult({ src, lines: [], error: true });
      }
    })();
    return () => controller.abort();
  }, [src]);
  return (
    <section aria-label={text.lines}>
      {error ? (
        <p role="alert">{text.error}</p>
      ) : lines === null ? (
        <output>{text.loading}</output>
      ) : lines.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        <>
          <ul className="space-y-3">
            {messagePage(lines, offset).map((line) => (
              <li
                key={line.key}
                className="min-h-6 whitespace-pre-wrap border-l-2 border-orange-400 pl-4"
              >
                {line.text}
              </li>
            ))}
          </ul>
          <nav className="mt-4 flex gap-3">
            <button
              className={inputClass}
              type="button"
              disabled={offset === 0}
              onClick={() => setPage({ src, offset: Math.max(0, offset - MESSAGE_PAGE_SIZE) })}
            >
              {text.previous}
            </button>
            <output>
              {Math.min(offset + 1, lines.length)}–
              {Math.min(offset + MESSAGE_PAGE_SIZE, lines.length)} / {lines.length}
            </output>
            <button
              className={inputClass}
              type="button"
              disabled={offset + MESSAGE_PAGE_SIZE >= lines.length}
              onClick={() => setPage({ src, offset: offset + MESSAGE_PAGE_SIZE })}
            >
              {text.next}
            </button>
          </nav>
        </>
      )}
    </section>
  );
}

export default function CpkScene() {
  const { locale } = useLangue();
  const text = dictionaries[locale];
  const [archives, setArchives] = useState<{ name: string }[]>([]);
  const [archive, setArchive] = useState("");
  const [kind, setKind] = useState<SceneKind>("model");
  const [audioFormat, setAudioFormat] = useState<"awb" | "acb">("awb");
  const [filter, setFilter] = useState("");
  const [index, setIndex] = useState<SceneIndex | null>(null);
  const [selected, setSelected] = useState<SceneEntry | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [cue, setCue] = useState(0);
  const searchController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(sceneUrl(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = (await response.json()) as { name: string }[];
        if (!Array.isArray(rows)) throw new Error("Invalid catalogue");
        setArchives(rows);
        setArchive(rows[0]?.name ?? "");
        return undefined;
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      controller.abort();
      searchController.current?.abort();
    };
  }, []);
  function clearSelection() {
    searchController.current?.abort();
    setPending(false);
    setIndex(null);
    setSelected(null);
    setCue(0);
  }
  async function search(offset = 0) {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setPending(true);
    setError(false);
    setSelected(null);
    try {
      const extension = kind === "audio" ? audioFormat : SCENE_EXTENSIONS[kind];
      const query = new URLSearchParams({
        q: filter.trim() ? `*${filter.trim()}*.${extension}` : `ext:${extension}`,
        limit: "40",
        offset: String(offset),
      });
      const response = await fetch(`${sceneUrl(archive, "find")}?${query}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = (await response.json()) as SceneIndex;
      if (!Array.isArray(result.entries)) throw new Error("Invalid index");
      if (!controller.signal.aborted) setIndex(result);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  const src = selected
    ? sceneUrl(
        archive,
        kind === "model" ? "model" : kind === "audio" ? "wav" : "raw",
        selected.path + (kind === "model" ? ".glb" : ""),
      )
    : "";
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-white">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">{text.title}</h1>
        <p className="max-w-3xl text-white/75">{text.description}</p>
      </header>
      <DuelScene text={text} />
      <CharacterScene text={text} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="grid gap-1">
          {text.archive}
          <select
            className={inputClass}
            value={archive}
            onChange={(event) => {
              clearSelection();
              setArchive(event.currentTarget.value);
            }}
          >
            {archives.map((row) => (
              <option key={row.name} value={row.name}>
                {row.name}.cpk
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          {text.kind}
          <select
            className={inputClass}
            value={kind}
            onChange={(event) => {
              clearSelection();
              setKind(event.currentTarget.value as SceneKind);
            }}
          >
            {(["model", "audio", "dialogue"] as const).map((item) => (
              <option key={item} value={item}>
                {text[item]}
              </option>
            ))}
          </select>
        </label>
        {kind === "audio" && (
          <label className="grid gap-1">
            {text.audioFormat}
            <select
              className={inputClass}
              value={audioFormat}
              onChange={(event) => {
                clearSelection();
                setAudioFormat(event.currentTarget.value as "awb" | "acb");
              }}
            >
              {(["awb", "acb"] as const).map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1">
          {text.query}
          <input
            className={inputClass}
            value={filter}
            maxLength={200}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
        </label>
        <button type="submit" className={inputClass} disabled={!archive || pending}>
          {pending ? text.loading : text.search}
        </button>
      </form>
      {error && <p role="alert">{archives.length ? text.error : text.unavailable}</p>}
      {kind === "model" && <p className="text-sm text-white/65">{text.modelHint}</p>}
      {kind === "audio" && <p className="text-sm text-white/65">{text.audioHint}</p>}
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-3">
          {index?.entries.length === 0 && <p>{text.empty}</p>}
          <ul className="max-h-[60vh] space-y-2 overflow-auto">
            {index?.entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className={`${inputClass} w-full break-all py-2 text-left text-xs`}
                  aria-pressed={selected?.path === entry.path}
                  onClick={() => {
                    setSelected(entry);
                    setCue(0);
                  }}
                >
                  {entry.path}
                </button>
              </li>
            ))}
          </ul>
          {index && (
            <nav className="flex gap-3">
              <button
                className={inputClass}
                disabled={pending || index.offset === 0}
                onClick={() => void search(Math.max(0, index.offset - index.limit))}
              >
                {text.previous}
              </button>
              <button
                className={inputClass}
                disabled={pending || index.offset + index.limit >= index.total}
                onClick={() => void search(index.offset + index.limit)}
              >
                {text.next}
              </button>
            </nav>
          )}
        </aside>
        <div className="min-w-0 space-y-4">
          {selected && <h2 className="break-all font-mono text-sm">{selected.path}</h2>}
          {src && kind === "model" && <ModelScene key={src} src={src} text={text} />}
          {src && kind === "dialogue" && <Dialogue key={src} src={src} text={text} />}
          {src && kind === "audio" && (
            <section className="space-y-4">
              <label className="grid gap-1">
                {text.cue}
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  className={inputClass}
                  value={cue}
                  onChange={(event) =>
                    setCue(Math.max(0, Math.floor(Number(event.currentTarget.value) || 0)))
                  }
                />
              </label>
              {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- source audio has no verified transcript mapping */}
              <audio
                key={`${src}-${cue}`}
                controls
                preload="none"
                src={`${src}?cue=${cue}`}
                aria-label={selected?.path}
                onError={() => setError(true)}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
