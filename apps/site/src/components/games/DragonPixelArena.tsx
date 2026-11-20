"use client";
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from "react";
import { useLangue } from "@/lib/i18n/client";
import {
  checkWebGpu,
  loadDragonPixel,
  type DragonPixelBindings,
  type WebGpuStatus,
} from "@/lib/dragon-pixel-loader";
import { DRAGON_PIXEL_WASM } from "@/lib/dragon-pixel-wasm.generated";
import { GAME_KEY_CODES, startCanvasView, type CanvasView } from "@/lib/dragon-pixel-canvas";
import {
  ARENA_IDS,
  DEFAULT_SELECTION,
  FIGHTER_IDS,
  MODE_IDS,
  STORY_CHAPTER_COUNT,
  parseBevyHud,
  parseStoryChapters,
  type ArenaHud,
  type ArenaSelection,
  type StoryChapterSummary,
} from "@/lib/dragon-pixel-options";
import fr from "../../../messages/dragon-pixel-arena/fr.json";
import en from "../../../messages/dragon-pixel-arena/en.json";
import ja from "../../../messages/dragon-pixel-arena/ja.json";

const dictionaries = { fr, en, ja };
const BEVY_CANVAS_ID = "arena-bevy";
const HUD_POLL_MS = 250;
const MEGABYTE = 1024 * 1024;

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "loading"; loaded: number }
  | { kind: "starting" }
  | { kind: "running"; renderer: "bevy" | "canvas" }
  | { kind: "error"; reason: string };

/**
 * Bevy cannot be torn down once its event loop is spawned, so its canvas and bindings outlive the
 * component: leaving the page pauses it and coming back re-attaches the same canvas.
 */
const bevy: { canvas: HTMLCanvasElement | null; bindings: DragonPixelBindings | null } = {
  canvas: null,
  bindings: null,
};

const format = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const megabytes = (bytes: number): string => (bytes / MEGABYTE).toFixed(1);

export function DragonPixelArena() {
  const { locale } = useLangue();
  const text = dictionaries[locale];
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasView = useRef<CanvasView | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [selection, setSelection] = useState<ArenaSelection>(DEFAULT_SELECTION);
  const [gpu, setGpu] = useState<WebGpuStatus | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [chapters, setChapters] = useState<StoryChapterSummary[]>([]);
  const [hidden, setHidden] = useState(false);
  const [hud, setHud] = useState<(ArenaHud & { frames: number }) | null>(null);

  const renderer = phase.kind === "running" ? phase.renderer : null;
  const paused = userPaused || hidden;

  const applyPause = useCallback((value: boolean) => {
    bevy.bindings?.dragon_pixel_set_paused(value);
    canvasView.current?.setPaused(value);
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (renderer) applyPause(paused);
  }, [renderer, paused, applyPause]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !bevy.canvas || !bevy.bindings) return;
    box.append(bevy.canvas);
    setPhase({ kind: "running", renderer: "bevy" });
    return () => {
      bevy.bindings?.dragon_pixel_set_paused(true);
      bevy.canvas?.remove();
    };
  }, []);

  useEffect(
    () => () => {
      canvasView.current?.stop();
      canvasView.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!renderer) return;
    const timer = window.setInterval(() => {
      if (renderer === "bevy" && bevy.bindings) {
        setHud(parseBevyHud(bevy.bindings.dragon_pixel_hud_json()));
        rumbleFromBevy(bevy.bindings);
      } else if (canvasView.current) {
        const snapshot = canvasView.current.hud();
        setHud(snapshot && { ...snapshot, frames: canvasView.current.frames() });
      }
    }, HUD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [renderer]);

  const launch = useCallback(async () => {
    const box = boxRef.current;
    if (!box) return;
    try {
      setPhase({ kind: "checking" });
      const status = await checkWebGpu();
      setGpu(status);
      setPhase({ kind: "loading", loaded: 0 });
      const bindings = await loadDragonPixel((loaded) => setPhase({ kind: "loading", loaded }));
      // A module built before `story_chapters_json` existed keeps the numbered picker.
      if (typeof bindings.story_chapters_json === "function")
        setChapters(parseStoryChapters(bindings.story_chapters_json()));
      setPhase({ kind: "starting" });
      if (status.available) {
        const canvas = document.createElement("canvas");
        canvas.id = BEVY_CANVAS_ID;
        canvas.tabIndex = 0;
        canvas.setAttribute("aria-label", text.canvasLabel);
        canvas.className = "absolute inset-0 block h-full w-full outline-none";
        canvas.addEventListener("keydown", (event) => {
          if (GAME_KEY_CODES.has(event.code)) event.preventDefault();
        });
        box.append(canvas);
        bevy.canvas = canvas;
        bevy.bindings = bindings;
        bindings.dragon_pixel_start(
          `#${BEVY_CANVAS_ID}`,
          selection.fighter,
          selection.mode,
          selection.chapter,
          selection.arena,
        );
        canvas.focus();
        setPhase({ kind: "running", renderer: "bevy" });
      } else {
        const canvas = document.createElement("canvas");
        canvas.tabIndex = 0;
        canvas.setAttribute("aria-label", text.canvasLabel);
        canvas.className = "absolute inset-0 block h-full w-full outline-none";
        box.append(canvas);
        canvasView.current = startCanvasView(canvas, bindings, selection);
        canvas.focus();
        setPhase({ kind: "running", renderer: "canvas" });
      }
    } catch (error) {
      setPhase({
        kind: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }, [selection, text.canvasLabel]);

  const restart = useCallback(() => {
    if (renderer === "bevy") {
      bevy.bindings?.dragon_pixel_configure(
        selection.fighter,
        selection.mode,
        selection.chapter,
        selection.arena,
      );
      bevy.canvas?.focus();
    } else {
      canvasView.current?.configure(selection);
    }
    setUserPaused(false);
  }, [renderer, selection]);

  const update = <Key extends keyof ArenaSelection>(key: Key, value: ArenaSelection[Key]) =>
    setSelection((current) => ({ ...current, [key]: value }));

  const message = statusMessage(text, phase, gpu, hud, paused);
  const fallbackNote =
    gpu && !gpu.available
      ? format(text.noWebgpu, { reason: gpu.reason === "no-api" ? text.noApi : text.noAdapter })
      : null;
  const percent =
    phase.kind === "loading"
      ? Math.min(100, Math.round((phase.loaded / DRAGON_PIXEL_WASM.wasmBytes) * 100))
      : 0;
  const busy = phase.kind === "checking" || phase.kind === "loading" || phase.kind === "starting";

  return (
    <section
      aria-label={text.arenaLabel}
      className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 text-white"
      data-renderer={renderer ?? "none"}
      data-frames={hud?.frames ?? 0}
    >
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">{text.title}</h1>
        <p className="max-w-prose text-sm text-white/70">{text.intro}</p>
      </header>

      <div
        ref={boxRef}
        className="relative mx-auto w-[min(100%,calc(75vh*16/9))] overflow-hidden rounded-xl border border-white/10 bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        {renderer ? null : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4 text-center">
            <output className="max-w-md text-sm text-white/80">{message}</output>
            {phase.kind === "loading" ? (
              <progress
                aria-label={text.loadingLabel}
                value={percent}
                max={100}
                className="h-2 w-64 max-w-full accent-amber-400"
              />
            ) : null}
            {phase.kind === "idle" || phase.kind === "error" ? (
              <button
                type="button"
                onClick={launch}
                className="min-h-11 rounded-xl bg-amber-500 px-6 py-2 font-display text-sm font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
              >
                {phase.kind === "error" ? text.retry : text.launch}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {fallbackNote ? (
        <p role="note" className="text-sm text-amber-300">
          {fallbackNote}
        </p>
      ) : null}
      {renderer ? <output className="block text-sm text-white/80">{message}</output> : null}

      {hud && renderer ? <Hud hud={hud} text={text} renderer={renderer} /> : null}

      <form
        className="grid grid-cols-2 items-end gap-3 sm:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (renderer) restart();
        }}
      >
        <Select
          label={text.fighter}
          value={selection.fighter}
          onChange={(value) => update("fighter", value as ArenaSelection["fighter"])}
          options={FIGHTER_IDS.map((id) => [id, text.fighters[id]])}
        />
        <Select
          label={text.mode}
          value={selection.mode}
          onChange={(value) => update("mode", value as ArenaSelection["mode"])}
          options={MODE_IDS.map((id) => [id, text.modes[id]])}
        />
        {selection.mode === "story" ? (
          <Select
            label={text.chapter}
            value={String(selection.chapter)}
            onChange={(value) => update("chapter", Number(value))}
            options={Array.from({ length: STORY_CHAPTER_COUNT }, (_, index) => {
              const known = chapters.find((chapter) => chapter.id === index + 1);
              return [
                String(index + 1),
                known ? known.title : format(text.chapterOption, { number: index + 1 }),
              ];
            })}
          />
        ) : (
          <Select
            label={text.arena}
            value={selection.arena}
            onChange={(value) => update("arena", value as ArenaSelection["arena"])}
            options={ARENA_IDS.map((id) => [id, text.arenas[id]])}
          />
        )}
        <button
          type="submit"
          disabled={!renderer}
          className="min-h-11 rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-semibold disabled:opacity-40"
        >
          {renderer ? text.restart : text.apply}
        </button>
        <button
          type="button"
          disabled={!renderer || busy}
          aria-pressed={userPaused}
          onClick={() => setUserPaused((value) => !value)}
          className="min-h-11 rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-semibold disabled:opacity-40"
        >
          {userPaused ? text.resume : text.pause}
        </button>
        {selection.mode === "story" ? (
          <ChapterSources
            chapter={chapters.find((chapter) => chapter.id === selection.chapter)}
            text={text}
          />
        ) : null}
      </form>

      <details className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <summary className="cursor-pointer text-sm font-semibold">{text.controlsTitle}</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-white/75">
          {text.controls.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

type Dictionary = (typeof dictionaries)["fr"];

function statusMessage(
  text: Dictionary,
  phase: Phase,
  gpu: WebGpuStatus | null,
  hud: ArenaHud | null,
  paused: boolean,
): string {
  switch (phase.kind) {
    case "idle":
      return format(text.status.idle, { size: megabytes(DRAGON_PIXEL_WASM.wasmBytes) });
    case "checking":
      return text.status.checking;
    case "loading":
      return format(text.status.loading, {
        percent: Math.min(100, Math.round((phase.loaded / DRAGON_PIXEL_WASM.wasmBytes) * 100)),
        loaded: megabytes(phase.loaded),
        total: megabytes(DRAGON_PIXEL_WASM.wasmBytes),
      });
    case "starting":
      return text.status.starting;
    case "error":
      return format(text.status.error, { reason: phase.reason });
    case "running":
      if (paused) return text.status.paused;
      if (hud?.status === "won") return text.status.won;
      if (hud?.status === "lost") return text.status.lost;
      return phase.renderer === "bevy" && gpu?.available
        ? text.status.running
        : text.status.fallback;
  }
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (readonly [string, string])[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-white/70">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-xl border border-white/20 bg-black/60 px-3 text-sm text-white"
      >
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Hud({
  hud,
  text,
  renderer,
}: {
  hud: ArenaHud & { frames: number };
  text: Dictionary;
  renderer: "bevy" | "canvas";
}) {
  const { ui } = hud;
  return (
    <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
      <Bars
        name={ui.player_name}
        role={text.hud.player}
        hp={ui.player_hp_ratio}
        ki={ui.player_ki_ratio}
        text={text}
      />
      <Bars
        name={ui.enemy_name}
        role={text.hud.enemy}
        hp={ui.enemy_hp_ratio}
        ki={ui.enemy_ki_ratio}
        text={text}
      />
      <dl className="col-span-full grid grid-cols-2 gap-2 text-xs text-white/70 sm:grid-cols-5">
        <Stat label={text.hud.combo} value={ui.player_combo} />
        <Stat label={text.hud.score} value={ui.player_score} />
        <Stat label={text.hud.time} value={`${ui.time_elapsed.toFixed(0)} s`} />
        <Stat label={text.hud.engine} value={text.engines[renderer]} />
        <Stat label={text.hud.frames} value={hud.frames} />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="font-mono text-sm text-white">{value}</dd>
    </div>
  );
}

function Bars({
  name,
  role,
  hp,
  ki,
  text,
}: {
  name: string;
  role: string;
  hp: number;
  ki: number;
  text: Dictionary;
}) {
  const bar = (label: string, ratio: number, color: string) => (
    <progress
      aria-label={`${name} ${label}`}
      value={Math.round(ratio * 100)}
      max={100}
      className={`h-2.5 w-full ${color}`}
    />
  );
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-white/60">
        {role} · <span className="font-semibold text-white">{name}</span>
      </p>
      {bar(text.hud.hp, hp, "accent-emerald-400")}
      {bar(text.hud.ki, ki, "accent-sky-400")}
    </div>
  );
}

function rumbleFromBevy(bindings: DragonPixelBindings): void {
  const events = JSON.parse(bindings.dragon_pixel_take_haptics_json()) as {
    weak_magnitude: number;
    strong_magnitude: number;
    duration_ms: number;
  }[];
  const event = events.at(-1);
  if (!event) return;
  const pad = Array.from(navigator.getGamepads?.() ?? []).find((entry) => entry?.connected);
  void pad?.vibrationActuator?.playEffect("dual-rumble", {
    startDelay: 0,
    duration: event.duration_ms,
    weakMagnitude: event.weak_magnitude,
    strongMagnitude: event.strong_magnitude,
  });
}

function ChapterSources({
  chapter,
  text,
}: {
  chapter: StoryChapterSummary | undefined;
  text: { chapterEpisode: string; chapterManga: string };
}) {
  if (!chapter || (chapter.episode_id === null && chapter.manga_volume_id === null)) return null;
  return (
    <p className="basis-full text-sm text-white/70">
      {chapter.saga}
      {chapter.manga_volume_id !== null ? (
        <>
          {" · "}
          <a
            className="underline underline-offset-2"
            href={`/wiki/manga/volume/${chapter.manga_volume_id}`}
          >
            {text.chapterManga}
          </a>
        </>
      ) : null}
      {chapter.episode_id !== null ? (
        <>
          {" · "}
          <a className="underline underline-offset-2" href={`/wiki/episodes/${chapter.episode_id}`}>
            {text.chapterEpisode}
          </a>
        </>
      ) : null}
    </p>
  );
}
