// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import { createXv2Duel, type Xv2DuelRenderer } from "@aphrody/shenron-engine/xv2-character";
import {
  characterCode,
  fetchCharacter,
  fetchCharacterSkills,
  fetchRoster,
  fetchSkillFiles,
  type RosterEntry,
} from "./cpk-scene";
import type fr from "../../../../messages/dragon-pixel-scene/fr.json";

const inputClass = "min-h-11 rounded border border-white/25 bg-slate-950 px-3 text-white";
/** Attack actions start at slot 300 in player `.bac` files (light, then heavy chains). */
const FIRST_ATTACK = 300;
const ATTACK_KEYS = ["j", "k", "l"] as const;
const WALK_STEP = 0.06;
/** Opponent: closes in, attacks in reach every `AI_COOLDOWN` seconds. Not the game's AI. */
const AI_REACH = 1.6;
const AI_COOLDOWN = 0.8;

type Phase = "idle" | "loading" | "ready" | "missing" | "error";
type Hud = { hp: [number, number]; hits: number };

function attacks(duel: Xv2DuelRenderer, player: number): number[] {
  return [...duel.actions(player)].filter((id) => id >= FIRST_ATTACK).slice(0, ATTACK_KEYS.length);
}

export default function DuelScene({ text }: { text: typeof fr }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const duelRef = useRef<Xv2DuelRenderer | null>(null);
  const keys = useRef(new Set<string>());
  const [codes, setCodes] = useState({ a: "GOK", b: "GOK" });
  const [started, setStarted] = useState<{ a: string; b: string } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [moves, setMoves] = useState<number[]>([]);
  const [hud, setHud] = useState<Hud>({ hp: [0, 0], hits: 0 });
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [skill, setSkill] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchRoster(controller.signal)
      .then((entries) => {
        if (controller.signal.aborted) return undefined;
        setRoster(entries);
        return undefined;
      })
      .catch(() => {
        if (!controller.signal.aborted) setRoster([]);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !started) return;
    const controller = new AbortController();
    let duel: Xv2DuelRenderer | null = null;
    let frame = 0;
    let lastAi = 0;
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(element.clientWidth * ratio));
      element.height = Math.max(1, Math.round(element.clientHeight * ratio));
      duel?.resize(element.width, element.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    setPhase("loading");
    void (async () => {
      try {
        const [a, b] = await Promise.all([
          fetchCharacter(started.a, controller.signal),
          fetchCharacter(started.b, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        if (!a || !b) {
          setPhase("missing");
          return;
        }
        duel = await createXv2Duel(element, a, b);
        if (controller.signal.aborted) {
          duel.free();
          duel = null;
          return;
        }
        duelRef.current = duel;
        const own = attacks(duel, 0);
        const theirs = attacks(duel, 1);
        setMoves(own);
        setPhase("ready");

        // Load the player's first real Super skill (e.g. Goku's Kamehameha), if their
        // roster entry and the skill's own asset files resolve. Non-fatal when they don't:
        // the duel stays playable with its base actions.
        const cmsId = roster?.find((r) => r.shortName === started.a)?.id;
        if (cmsId !== undefined) {
          void (async () => {
            try {
              const [first] = await fetchCharacterSkills(cmsId, "super", controller.signal);
              if (!first || controller.signal.aborted || !duel) return;
              const { ean, bac } = await fetchSkillFiles(first.eanPath, controller.signal);
              if (controller.signal.aborted || !duel) return;
              const ids = duel.loadSkill(0, ean, bac);
              if (ids.length) setSkill({ id: ids[0]!, name: first.shortName });
            } catch {
              // Skill is optional; the duel already works without it.
            }
          })();
        }
        const draw = (time: number) => {
          if (controller.signal.aborted || !duel) return;
          const seconds = time / 1000;
          if (keys.current.has("arrowright") || keys.current.has("d")) duel.walk(0, WALK_STEP);
          if (keys.current.has("arrowleft") || keys.current.has("a")) duel.walk(0, -WALK_STEP);
          if (duel.hp(0) > 0 && duel.hp(1) > 0 && duel.ready(1)) {
            if (duel.distance() > AI_REACH) duel.walk(1, WALK_STEP);
            else if (seconds - lastAi > AI_COOLDOWN && theirs.length) {
              lastAi = seconds;
              duel.attack(1, theirs[Math.floor(Math.random() * theirs.length)]!);
            }
          }
          if (!document.hidden && !duel.frame(seconds)) {
            setPhase("error");
            return;
          }
          setHud((previous) => {
            const next: Hud = { hp: [duel!.hp(0), duel!.hp(1)], hits: duel!.hits() };
            return next.hits === previous.hits &&
              next.hp[0] === previous.hp[0] &&
              next.hp[1] === previous.hp[1]
              ? previous
              : next;
          });
          frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
      } catch {
        if (!controller.signal.aborted) setPhase("error");
      }
    })();
    return () => {
      controller.abort();
      observer.disconnect();
      cancelAnimationFrame(frame);
      duel?.free();
      duelRef.current = null;
      setSkill(null);
    };
  }, [started, roster]);

  useEffect(() => {
    if (phase !== "ready") return;
    const held = keys.current;
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "u" && skill) {
        duelRef.current?.playSkill(0, skill.id);
        return;
      }
      const slot = ATTACK_KEYS.indexOf(key as (typeof ATTACK_KEYS)[number]);
      if (slot >= 0 && moves[slot] !== undefined) duelRef.current?.attack(0, moves[slot]);
      else held.add(key);
    };
    const up = (event: KeyboardEvent) => held.delete(event.key.toLowerCase());
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      held.clear();
    };
  }, [phase, moves, skill]);

  const over = phase === "ready" && (hud.hp[0] === 0 || hud.hp[1] === 0);
  return (
    <section className="space-y-4" aria-labelledby="duel-title">
      <h2 id="duel-title" className="text-2xl font-bold">
        {text.duelTitle}
      </h2>
      <p className="max-w-3xl text-sm text-white/70">{text.duelHint}</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const a = characterCode(codes.a);
          const b = characterCode(codes.b);
          if (a && b) setStarted({ a, b });
        }}
      >
        {(["a", "b"] as const).map((side) =>
          roster && roster.length > 0 ? (
            <label key={side} className="grid gap-1">
              {side === "a" ? text.duelPlayer : text.duelOpponent}
              <select
                className={inputClass}
                value={codes[side]}
                onChange={(event) => setCodes({ ...codes, [side]: event.currentTarget.value })}
              >
                {roster.map((entry) => (
                  <option key={entry.id} value={entry.shortName}>
                    {entry.shortName} · #{entry.id}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label key={side} className="grid gap-1">
              {side === "a" ? text.duelPlayer : text.duelOpponent}
              <input
                className={inputClass}
                value={codes[side]}
                maxLength={8}
                placeholder={roster === null ? text.loading : undefined}
                onChange={(event) => setCodes({ ...codes, [side]: event.currentTarget.value })}
              />
            </label>
          ),
        )}
        <button
          type="submit"
          className={inputClass}
          disabled={!characterCode(codes.a) || !characterCode(codes.b) || phase === "loading"}
        >
          {phase === "loading" ? text.loading : text.duelStart}
        </button>
      </form>
      {started && (
        <canvas
          ref={canvas}
          tabIndex={0}
          className="h-[60vh] min-h-72 w-full rounded-xl bg-slate-950"
          aria-label={text.duelTitle}
        />
      )}
      {phase === "missing" && <p role="alert">{text.characterMissing}</p>}
      {phase === "error" && <p role="alert">{text.gpu}</p>}
      {phase === "ready" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {([0, 1] as const).map((player) => (
            <label key={player} className="grid gap-1">
              {player === 0 ? text.duelPlayer : text.duelOpponent} — {text.duelHealth}
              <meter min={0} max={1000} value={hud.hp[player]}>
                {hud.hp[player]}
              </meter>
            </label>
          ))}
          <p className="sm:col-span-2 text-sm text-white/70">
            {text.duelControls} · {text.duelHits} {hud.hits}
            {skill && ` · ${text.duelSkillReady.replace("{name}", skill.name)}`}
          </p>
          {over && (
            <output className="sm:col-span-2 text-xl font-bold">
              {hud.hp[0] === 0 ? text.duelLose : text.duelWin}
            </output>
          )}
        </div>
      )}
    </section>
  );
}
