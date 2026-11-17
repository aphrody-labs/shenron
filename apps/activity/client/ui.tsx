// SPDX-License-Identifier: Apache-2.0
/** Small building blocks shared by the screens. No visible string lives here. */
import type { Locale } from "@aphrody/shenron-activity/protocol";
import { useEffect, useState, type ReactNode } from "react";
import zeniBadge from "@aphrody/shenron-ui/assets/badges/badge-zeni.svg";
import kintoUn from "@aphrody/shenron-ui/assets/dbz/kinto-un.svg";
import { translator } from "./i18n";

// ── Dragon Ball sphere ───────────────────────────────────────────────────────

/** Star centres (viewBox 100) for 1 to 7 stars, as on the seven spheres. */
export const STAR_LAYOUTS: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  1: [[50, 52]],
  2: [
    [37, 52],
    [63, 52],
  ],
  3: [
    [50, 38],
    [36, 62],
    [64, 62],
  ],
  4: [
    [37, 40],
    [63, 40],
    [37, 64],
    [63, 64],
  ],
  5: [
    [37, 38],
    [63, 38],
    [50, 54],
    [37, 70],
    [63, 70],
  ],
  6: [
    [38, 32],
    [62, 32],
    [32, 54],
    [68, 54],
    [38, 74],
    [62, 74],
  ],
  7: [
    [50, 28],
    [30, 40],
    [70, 40],
    [50, 52],
    [30, 66],
    [70, 66],
    [50, 78],
  ],
};

function starPath(cx: number, cy: number, radius: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.42;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(
      `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return `M${points.join("L")}Z`;
}

/** A Dragon Ball with `stars` red stars: ink outline, flat orange body, one highlight. */
export function DragonBall({ stars, size = 40 }: { stars: number; size?: number }) {
  const layout = STAR_LAYOUTS[Math.min(7, Math.max(1, stars))] ?? STAR_LAYOUTS[1]!;
  const radius = layout.length > 4 ? 8 : layout.length > 2 ? 10 : 13;
  return (
    <svg
      className="dball"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="50" cy="50" r="46" className="dball__body" />
      <circle cx="50" cy="50" r="46" className="dball__ink" />
      <ellipse
        cx="34"
        cy="28"
        rx="13"
        ry="8"
        className="dball__shine"
        transform="rotate(-30 34 28)"
      />
      {layout.map(([x, y]) => (
        <path key={`${x}-${y}`} d={starPath(x, y, radius)} className="dball__star" />
      ))}
    </svg>
  );
}

// ── Avatars ──────────────────────────────────────────────────────────────────

export function avatarUrl(userId: string, hash: string | null, size = 64): string | null {
  return hash ? `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=${size}` : null;
}

/** Stable colour class from the id: the same member keeps the same fallback colour. */
export function avatarTone(userId: string): number {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 6;
}

export function initialsOf(name: string): string {
  const first = [...name.trim()].find((char) => /[\p{L}\p{N}]/u.test(char));
  return (first ?? "?").toUpperCase();
}

export function Avatar({
  userId,
  name,
  avatar,
  size = 40,
}: {
  userId: string;
  name: string;
  avatar: string | null;
  size?: number;
}) {
  const url = avatarUrl(userId, avatar, size > 48 ? 128 : 64);
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={`avatar tone-${avatarTone(userId)}`}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
      aria-hidden="true"
    >
      {url && !broken ? (
        <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

// ── Decor and pieces ─────────────────────────────────────────────────────────

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <img className="backdrop__cloud" src={kintoUn} alt="" width="320" height="320" />
    </div>
  );
}

export function ZeniCoin({ size = 22 }: { size?: number }) {
  return <img className="zeni" src={zeniBadge} alt="" width={size} height={size} />;
}

export function Header({ locale, aside }: { locale: Locale; aside?: ReactNode }) {
  const t = translator(locale);
  return (
    <header className="header">
      <div className="brand">
        <DragonBall stars={4} size={44} />
        <div className="brand__text">
          <h1 className="brand__title">{t("app.title")}</h1>
          <p className="brand__subtitle">{t("app.subtitle")}</p>
        </div>
      </div>
      {aside ? <div className="header__aside">{aside}</div> : null}
    </header>
  );
}

/** `Date.now()` refreshed every `intervalMs` while `active`. */
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/** Visually hidden, announced by screen readers. */
export function Live({ children }: { children: ReactNode }) {
  return (
    <output className="sr-only" aria-live="polite">
      {children}
    </output>
  );
}
