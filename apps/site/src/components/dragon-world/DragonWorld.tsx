// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  BookOpen,
  Expand,
  RotateCcw,
  Settings2,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import {
  createXv2World,
  type Xv2WorldRenderer,
  type Xv2WorldTextureProfile,
  type Xv2WorldFrameStats,
} from "@aphrody/shenron-engine/glb-scene";
import { useLangue } from "@/lib/i18n/client";
import {
  discoverStages,
  loadStageScene,
  defaultStage,
  StageResourceError,
  type CpkStage,
} from "./cpk-world-assets";
import { sceneUrl } from "../../app/games/dragon-pixel/cpk-scene";
import WorldCatalog, { usePublicCatalog } from "./WorldCatalog";
import { loadWorldCharacter } from "./world-character-assets";
import fr from "../../../messages/dragon-world/fr.json";
import en from "../../../messages/dragon-world/en.json";
import ja from "../../../messages/dragon-world/ja.json";
import styles from "./dragon-world.module.css";

const CpkScene = dynamic(() => import("../../app/games/dragon-pixel/CpkScene"), { ssr: false });
const dictionaries = { fr, en, ja };
type Camera = { x: number; y: number; z: number; yaw: number; pitch: number; speed: number };
const moveCodes = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyZ",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
]);

export default function DragonWorld({ standalone = false }: { standalone?: boolean }) {
  const { locale } = useLangue(),
    text = dictionaries[locale];
  const stageNames: Record<string, string> = text.stages;
  const stageName = (id: string) => stageNames[id] ?? id;
  const root = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<Xv2WorldRenderer | null>(null);
  const camera = useRef<Camera>({ x: 0, y: 3, z: 10, yaw: 0, pitch: 0, speed: 5 });
  const spawn = useRef<Camera>({ x: 0, y: 3, z: 10, yaw: 0, pitch: 0, speed: 5 });
  const actorSpawn = useRef({ x: 0, y: 0, z: 0, yaw: 0 });
  const keys = useRef(new Set<string>());
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const focused = useRef(false);
  const actorMode = useRef(true);
  const [characterMode, setCharacterMode] = useState(true);
  const [actions, setActions] = useState<number[]>([]);
  const [action, setAction] = useState(0);
  const [archive, setArchive] = useState("data");
  const [revision, setRevision] = useState(0);
  const [stages, setStages] = useState<{
    archive: string;
    revision: number;
    entries: CpkStage[];
    error?: boolean;
  }>();
  const [selected, setSelected] = useState<CpkStage | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error" | "gpu">("idle");
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [oversized, setOversized] = useState(false);
  const [textureProfile, setTextureProfile] = useState<Xv2WorldTextureProfile | null>(null);
  const [renderSample, setRenderSample] = useState<{
    stats: Xv2WorldFrameStats;
    presentationsPerSecond: number | null;
    position: number[];
  } | null>(null);
  const [catalog, setCatalog] = useState(false),
    [settings, setSettings] = useState(false),
    [lab, setLab] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const archives = usePublicCatalog<{ name: string; size: number }[]>(sceneUrl(), revision);
  const visibleStages =
    stages?.archive === archive && stages.revision === revision ? stages : undefined;

  useEffect(() => {
    const controller = new AbortController();
    void discoverStages(archive, controller.signal)
      .then((entries) => {
        if (!controller.signal.aborted) {
          setStages({ archive, revision, entries });
          setSelected(defaultStage(entries) ?? null);
        }
        return entries;
      })
      .catch(() => {
        if (!controller.signal.aborted) setStages({ archive, revision, entries: [], error: true });
      });
    return () => controller.abort();
  }, [archive, revision]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !selected || selected.archive !== archive) return;
    const controller = new AbortController();
    let renderer: Xv2WorldRenderer | null = null,
      frame = 0,
      previous = 0;
    const clear = () => {
      keys.current.clear();
      focused.current = false;
      drag.current = null;
    };
    const release = () => {
      const current = renderer;
      renderer = null;
      if (handle.current === current) handle.current = null;
      current?.free();
    };
    const restoreFocus = () => {
      focused.current = document.activeElement === element;
    };
    const visibility = () => {
      if (document.hidden) clear();
      else restoreFocus();
    };
    window.addEventListener("blur", clear);
    window.addEventListener("focus", restoreFocus);
    document.addEventListener("visibilitychange", visibility);
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 1.75);
      element.width = Math.max(1, Math.round(element.clientWidth * ratio));
      element.height = Math.max(1, Math.round(element.clientHeight * ratio));
      renderer?.resize(element.width, element.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    // External CPK/renderer lifecycle; status follows the selected real resource.
    setPhase("loading");
    setOversized(false);
    setTextureProfile(null);
    setRenderSample(null);
    setProgress({ loaded: 0, total: 0 });
    setActions([]);
    void (async () => {
      try {
        if (!(navigator as Navigator & { gpu?: unknown }).gpu) {
          setPhase("gpu");
          return;
        }
        const scene = await loadStageScene(selected, controller.signal, (loaded, total) => {
          if (!controller.signal.aborted) setProgress({ loaded, total });
        });
        if (controller.signal.aborted) return;
        renderer = await createXv2World(element, scene.parts);
        if (controller.signal.aborted) {
          renderer.free();
          renderer = null;
          return;
        }
        handle.current = renderer;
        setTextureProfile(renderer.textureProfile());
        const bounds = renderer.bounds();
        const span = Math.max(bounds[3]! - bounds[0]!, bounds[5]! - bounds[2]!, 1);
        const height = Math.max(bounds[4]! - bounds[1]!, 1);
        camera.current = {
          x: (bounds[0]! + bounds[3]!) / 2,
          y: bounds[1]! + height * 0.22,
          z: bounds[5]! + span * 0.12,
          yaw: 0,
          pitch: -0.08,
          speed: Math.max(2, span / 18),
        };
        const originalSpawn = scene.spawns.find((entry) => entry.name === "VS_INIT_POS_A_0");
        if (originalSpawn) {
          const matrix = originalSpawn.matrix;
          actorSpawn.current = {
            x: matrix[12]!,
            y: matrix[13]!,
            z: matrix[14]!,
            yaw: Math.atan2(matrix[8]!, matrix[10]!),
          };
          camera.current = {
            ...camera.current,
            x: matrix[12]!,
            y: matrix[13]! + 1.8,
            z: matrix[14]!,
            yaw: -actorSpawn.current.yaw,
            pitch: -0.08,
            speed: 8,
          };
        } else {
          actorSpawn.current = { x: camera.current.x, y: bounds[1]!, z: camera.current.z, yaw: 0 };
          actorMode.current = false;
          setCharacterMode(false);
        }
        spawn.current = { ...camera.current };
        const character = await loadWorldCharacter("GOK", controller.signal);
        if (controller.signal.aborted) return;
        if (!character?.motion) throw new Error("Verified world character is unavailable");
        renderer.setActor(character.files, character.motion.idleName, character.motion.walkName, 4);
        const placement = actorSpawn.current;
        renderer.actorPlace(placement.x, placement.y, placement.z, placement.yaw);
        const originalActions = [...renderer.actorActions()];
        setActions(originalActions);
        setAction(originalActions[0] ?? 0);
        setPhase("ready");
        const draw = (time: number) => {
          if (controller.signal.aborted || !renderer) return;
          try {
            const dt = Math.min((time - previous) / 1000, 0.05);
            previous = time;
            if (!document.hidden) {
              const c = camera.current,
                pressed = keys.current;
              let forward =
                Number(pressed.has("KeyW") || pressed.has("KeyZ") || pressed.has("ArrowUp")) -
                Number(pressed.has("KeyS") || pressed.has("ArrowDown"));
              let right =
                Number(pressed.has("KeyD") || pressed.has("ArrowRight")) -
                Number(pressed.has("KeyA") || pressed.has("KeyQ") || pressed.has("ArrowLeft"));
              let up =
                Number(pressed.has("Space")) -
                Number(pressed.has("ShiftLeft") || pressed.has("ShiftRight"));
              if (focused.current) {
                const pad = navigator.getGamepads?.().find((gamepad) => gamepad?.connected);
                if (pad) {
                  const axis = (index: number) =>
                    Math.abs(pad.axes[index] ?? 0) > 0.15 ? pad.axes[index]! : 0;
                  forward -= axis(1);
                  right += axis(0);
                  c.yaw += axis(2) * dt * 1.8;
                  c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch - axis(3) * dt * 1.8));
                  up += Number(pad.buttons[0]?.pressed) - Number(pad.buttons[1]?.pressed);
                }
              }
              const norm = Math.max(1, Math.hypot(forward, right, up)),
                speed = (c.speed * dt) / norm;
              if (actorMode.current) {
                renderer.actorInput(forward, right, -c.yaw);
                const position = renderer.actorPosition();
                c.x = position[0]! - Math.sin(c.yaw) * 5;
                c.y = position[1]! + 2.2;
                c.z = position[2]! + Math.cos(c.yaw) * 5;
              } else {
                renderer.actorInput(0, 0, -c.yaw);
                c.x += (Math.sin(c.yaw) * forward + Math.cos(c.yaw) * right) * speed;
                c.z += (-Math.cos(c.yaw) * forward + Math.sin(c.yaw) * right) * speed;
                c.y += up * speed;
              }
              renderer.camera(c.x, c.y, c.z, c.yaw, c.pitch);
              if (!renderer.frame(time / 1000)) {
                setPhase("error");
                clear();
                release();
                return;
              }
            }
            frame = requestAnimationFrame(draw);
          } catch (error) {
            if (process.env.NODE_ENV === "development") console.warn("DBXV2 frame failed", error);
            clear();
            release();
            setPhase("error");
          }
        };
        frame = requestAnimationFrame(draw);
      } catch (error) {
        if (!controller.signal.aborted) {
          release();
          if (process.env.NODE_ENV === "development")
            console.warn("DBXV2 stage load failed", error);
          setOversized(
            error instanceof StageResourceError && ["parts", "bytes"].includes(error.reason),
          );
          setPhase("error");
        }
      }
    })();
    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
      clear();
      observer.disconnect();
      release();
      window.removeEventListener("blur", clear);
      window.removeEventListener("focus", restoreFocus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [selected, archive]);

  useEffect(() => {
    if (phase !== "ready") return;
    let previous: { time: number; count: number } | undefined;
    const timer = window.setInterval(() => {
      const renderer = handle.current;
      if (!renderer || typeof renderer.frameStats !== "function") return;
      const stats = renderer.frameStats();
      const time = performance.now();
      const presentationsPerSecond =
        previous && time > previous.time
          ? ((stats.presentRequests - previous.count) * 1000) / (time - previous.time)
          : null;
      previous = { time, count: stats.presentRequests };
      setRenderSample({ stats, presentationsPerSecond, position: [...renderer.actorPosition()] });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  useEffect(() => {
    if (!catalog && !settings && !lab) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape" && root.current?.contains(document.activeElement)) {
        event.preventDefault();
        setCatalog(false);
        setSettings(false);
        setLab(false);
        canvas.current?.focus();
      }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [catalog, settings, lab]);
  function recenter() {
    camera.current = { ...spawn.current };
    if (actorMode.current) {
      const placement = actorSpawn.current;
      handle.current?.actorPlace(placement.x, placement.y, placement.z, placement.yaw);
    }
  }
  const active = selected?.archive === archive ? selected : null;
  const phaseVisible = active ? phase : "idle";

  return (
    <div
      className={`${styles.root}${standalone ? ` ${styles.standalone}` : ""}`}
      ref={root}
      data-cpk-stage={active?.id}
      data-render-state={phaseVisible}
      data-render-stats={renderSample ? JSON.stringify(renderSample.stats) : undefined}
      data-present-requests-per-second={renderSample?.presentationsPerSecond ?? undefined}
      data-actor-position={renderSample?.position.join(",")}
      data-texture-count={textureProfile?.textureCount}
      data-texture-bytes={textureProfile?.decodedBytes}
      data-texture-reduced={textureProfile?.reducedTextureCount}
    >
      <section className={styles.viewport} aria-label={text.worldLabel}>
        <canvas
          key={`${archive}:${active?.id ?? "none"}`}
          ref={canvas}
          tabIndex={0}
          className={styles.canvas}
          aria-label={`${text.worldLabel}. ${characterMode ? text.actorControls : text.keyboardHelp}`}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            keys.current.clear();
          }}
          onKeyDown={(event) => {
            if (moveCodes.has(event.code)) {
              event.preventDefault();
              keys.current.add(event.code);
            }
            if (event.code === "Home") recenter();
            if (event.code === "KeyJ" && !event.repeat && actorMode.current) {
              event.preventDefault();
              handle.current?.actorAttack(action);
            }
          }}
          onKeyUp={(event) => {
            keys.current.delete(event.code);
          }}
          onPointerDown={(event) => {
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
          }}
          onPointerMove={(event) => {
            const previous = drag.current;
            if (!previous || previous.id !== event.pointerId) return;
            camera.current.yaw += (event.clientX - previous.x) * 0.004;
            camera.current.pitch = Math.max(
              -1.45,
              Math.min(1.45, camera.current.pitch - (event.clientY - previous.y) * 0.004),
            );
            drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        />
        <header className={styles.hud}>
          <div>
            <h1>{text.title}</h1>
            <p>{active ? `${active.archive}.cpk / ${stageName(active.id)}` : text.subtitle}</p>
          </div>
          <div className={styles.toolbar}>
            <button
              type="button"
              aria-label={text.resourcesLabel}
              aria-expanded={settings}
              onClick={() => setSettings((value) => !value)}
            >
              <Settings2 size={19} />
            </button>
            <button
              type="button"
              aria-label={text.recenter}
              onClick={recenter}
              disabled={phaseVisible !== "ready"}
            >
              <RotateCcw size={19} />
            </button>
            <button
              type="button"
              aria-label={text.catalogueToggle}
              aria-expanded={catalog}
              onClick={() => setCatalog((value) => !value)}
            >
              <BookOpen size={19} />
              <span>{text.collections}</span>
            </button>
            <button
              type="button"
              aria-label={fullscreen ? text.exitFullScreen : text.fullScreen}
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void root.current?.requestFullscreen?.();
              }}
            >
              <Expand size={18} />
            </button>
          </div>
        </header>
        {settings && (
          <aside className={styles.resources} aria-label={text.resourcesLabel}>
            <header>
              <h2>{text.resourcesLabel}</h2>
              <button type="button" aria-label={text.close} onClick={() => setSettings(false)}>
                <X size={18} />
              </button>
            </header>
            <label>
              {text.archive}
              <select
                value={archive}
                onChange={(event) => {
                  keys.current.clear();
                  setArchive(event.currentTarget.value);
                }}
              >
                {archives?.data?.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}.cpk
                  </option>
                )) ?? <option value="data">data.cpk</option>}
              </select>
            </label>
            <label>
              {text.stage}
              <select
                value={active?.id ?? ""}
                disabled={!visibleStages?.entries.length}
                onChange={(event) => {
                  const stage = visibleStages?.entries.find(
                    (item) => item.id === event.currentTarget.value,
                  );
                  if (stage) setSelected(stage);
                }}
              >
                <option value="" disabled>
                  {!visibleStages ? text.loading : text.stageMissing}
                </option>
                {visibleStages?.entries.map((stage) => (
                  <option value={stage.id} key={stage.id}>
                    {stageName(stage.id)} · {stage.parts.length} NSK ·{" "}
                    {(stage.bytes / 1048576).toFixed(1)} MiB
                  </option>
                ))}
              </select>
            </label>
            {active && (
              <p className={styles.resourceInfo}>
                {active.parts.length} NSK · {(active.bytes / 1048576).toFixed(1)} MiB
              </p>
            )}
            {textureProfile && (
              <p className={styles.resourceInfo} title={text.textureDetailNote}>
                {text.textureQuality}:{" "}
                {textureProfile.reducedTextureCount ? text.textureAdapted : text.textureOriginal}
              </p>
            )}
            <label>
              {text.character}
              <select
                value={characterMode ? "actor" : "camera"}
                onChange={(event) => {
                  const enabled = event.currentTarget.value === "actor";
                  keys.current.clear();
                  actorMode.current = enabled;
                  setCharacterMode(enabled);
                }}
              >
                <option value="actor">{text.actorMode}</option>
                <option value="camera">{text.cameraMode}</option>
              </select>
            </label>
            {characterMode && actions.length > 0 && (
              <>
                <label>
                  {text.actorAction}
                  <select
                    value={action}
                    onChange={(event) => setAction(Number(event.currentTarget.value))}
                  >
                    {actions.map((id) => (
                      <option key={id} value={id}>
                        BAC {id}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => handle.current?.actorAttack(action)}>
                  {text.playAction}
                </button>
              </>
            )}
            {visibleStages?.error && <p>{text.loadError}</p>}
            {visibleStages && !visibleStages.error && !visibleStages.entries.length && (
              <p>{text.stageMissing}</p>
            )}
            <a href="/games/xenoverse-2">
              {text.sourceCPK}
              <ArrowRight size={14} />
            </a>
            {standalone && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSettings(false);
                    setLab(true);
                  }}
                >
                  {text.lab}
                </button>
                <p className={styles.resourceInfo}>{text.canonNote}</p>
              </>
            )}
          </aside>
        )}
        {phaseVisible !== "ready" && (
          <output className={styles.status} aria-live="polite">
            <strong>
              {phaseVisible === "gpu"
                ? text.webgpuRequired
                : phaseVisible === "error" || visibleStages?.error
                  ? oversized
                    ? text.stageTooLarge
                    : text.loadError
                  : !active && visibleStages
                    ? text.stageMissing
                    : text.loading}
            </strong>
            {phaseVisible === "loading" && progress.total > 0 && (
              <>
                <progress max={progress.total} value={progress.loaded} />
                <span>
                  {progress.loaded} / {progress.total}
                </span>
              </>
            )}
            {(phaseVisible === "error" || visibleStages?.error) && (
              <button type="button" onClick={() => setRevision((value) => value + 1)}>
                {text.retry}
              </button>
            )}
          </output>
        )}
        {phaseVisible === "ready" && (
          <div className={styles.controls}>
            <p>{characterMode ? text.actorControls : text.controlsZQSD}</p>
            <div className={styles.touch}>
              {(
                [
                  ["KeyW", text.moveForward, ArrowUp],
                  ["KeyA", text.moveLeft, ArrowLeft],
                  ["KeyS", text.moveBack, ArrowDown],
                  ["KeyD", text.moveRight, ArrowRight],
                  ["Space", text.moveUp, ArrowUp],
                  ["ShiftLeft", text.moveDown, ArrowDown],
                ] as const
              )
                .filter(([key]) => !characterMode || !["Space", "ShiftLeft"].includes(key))
                .map(([key, label, Icon]) => (
                  <button
                    type="button"
                    key={key}
                    aria-label={label}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      keys.current.add(key);
                    }}
                    onPointerUp={() => keys.current.delete(key)}
                    onPointerCancel={() => keys.current.delete(key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        keys.current.add(key);
                      }
                    }}
                    onKeyUp={() => keys.current.delete(key)}
                    onBlur={() => keys.current.delete(key)}
                  >
                    <Icon size={19} />
                    {["Space", "ShiftLeft"].includes(key) && <small>{label}</small>}
                  </button>
                ))}
            </div>
          </div>
        )}
        {catalog && (
          <aside className={styles.catalogOverlay} aria-label={text.allCollections}>
            <button
              className={styles.closeCatalog}
              type="button"
              aria-label={text.close}
              onClick={() => setCatalog(false)}
            >
              <X size={18} />
            </button>
            <WorldCatalog text={text} locale={locale} />
          </aside>
        )}
      </section>
      {(!standalone || lab) && (
        <div className={standalone ? styles.labOverlay : styles.below}>
          <p>{text.canonNote}</p>
          <button type="button" aria-expanded={lab} onClick={() => setLab((value) => !value)}>
            {text.lab}
            <ArrowRight size={17} />
          </button>
          {lab && <CpkScene />}
        </div>
      )}
    </div>
  );
}
