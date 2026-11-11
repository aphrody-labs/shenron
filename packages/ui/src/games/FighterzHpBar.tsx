// SPDX-License-Identifier: Apache-2.0
import type { SVGProps } from "react";

export interface FighterzHpBarProps extends SVGProps<SVGSVGElement> {
  activeHp?: number; // 0..100
  recoverableHp?: number; // 0..100
  ghostHp?: number; // 0..100
  fighterName?: string;
  assistReady?: boolean;
}

/**
 * FighterZ High-DPI Slanted Health Bar Frame (15-degree italic shear).
 */
export function FighterzHpBar({
  activeHp = 100,
  recoverableHp = 100,
  ghostHp = 100,
  fighterName = "SON GOKU",
  assistReady = true,
  className,
  ...props
}: FighterzHpBarProps) {
  const safeActive = Math.max(0, Math.min(100, activeHp));
  const safeRecoverable = Math.max(safeActive, Math.min(100, recoverableHp));
  const safeGhost = Math.max(safeActive, Math.min(100, ghostHp));

  return (
    <div className={`relative flex flex-col gap-1 ${className ?? ""}`}>
      <div className="flex items-center justify-between px-2 text-xs font-black tracking-wider uppercase text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
        <span className="flex items-center gap-1.5 font-display text-sm text-yellow-400">
          {fighterName}
        </span>
        {assistReady && (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/40">
            ASSIST OK
          </span>
        )}
      </div>

      <svg
        viewBox="0 0 600 64"
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
        {...props}
      >
        <defs>
          <linearGradient id="hpBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          <linearGradient id="hpActiveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="35%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>

          <linearGradient id="hpBlueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>

          <linearGradient id="hpGhostGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>

          <linearGradient id="bevelGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="50%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>

          <clipPath id="hpBarClip">
            <polygon points="16,4 584,4 568,60 0,60" />
          </clipPath>
        </defs>

        {/* Outer Metallic Beveled Border */}
        <polygon
          points="14,2 586,2 570,62 -2,62"
          fill="url(#bevelGrad)"
          stroke="#090d16"
          strokeWidth="2"
        />

        {/* Inner HP Channel */}
        <g clipPath="url(#hpBarClip)">
          {/* Base Channel Background */}
          <rect x="0" y="0" width="600" height="64" fill="url(#hpBgGrad)" />

          {/* Red Damage Ghost Bar */}
          <rect
            x="0"
            y="0"
            width={`${safeGhost * 6}px`}
            height="64"
            fill="url(#hpGhostGrad)"
            className="transition-all duration-500 ease-out"
          />

          {/* Blue Recoverable Life Bar */}
          <rect
            x="0"
            y="0"
            width={`${safeRecoverable * 6}px`}
            height="64"
            fill="url(#hpBlueGrad)"
            className="transition-all duration-300 ease-out"
          />

          {/* Active Health Bar */}
          <rect
            x="0"
            y="0"
            width={`${safeActive * 6}px`}
            height="64"
            fill="url(#hpActiveGrad)"
            className="transition-all duration-150 ease-out"
          />

          {/* Segmented Tick Marks (Every 10% HP) */}
          {[60, 120, 180, 240, 300, 360, 420, 480, 540].map((x) => (
            <line
              key={x}
              x1={x}
              y1="0"
              x2={x - 15}
              y2="64"
              stroke="#000000"
              strokeWidth="2"
              opacity="0.35"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
