// SPDX-License-Identifier: Apache-2.0
import type { SVGProps } from "react";

export interface DragonRadarHudProps extends SVGProps<SVGSVGElement> {
  ballsCollected?: number; // 0..7
  shenronReady?: boolean;
}

/**
 * FighterZ & Toriyama Canon Dragon Radar HUD Component.
 */
export function DragonRadarHud({
  ballsCollected = 0,
  shenronReady = false,
  className,
  ...props
}: DragonRadarHudProps) {
  const safeCount = Math.max(0, Math.min(7, ballsCollected));
  const isSummonReady = shenronReady || safeCount === 7;

  return (
    <div className={`relative flex flex-col items-center gap-1 ${className ?? ""}`}>
      <svg
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
        className="size-24 drop-shadow-[0_4px_16px_rgba(34,197,94,0.3)]"
        {...props}
      >
        <defs>
          <radialGradient id="radarScreenGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#14532d" />
            <stop offset="85%" stopColor="#052e16" />
            <stop offset="100%" stopColor="#021c0e" />
          </radialGradient>
          <radialGradient id="radarBevelGrad" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="60%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#334155" />
          </radialGradient>
        </defs>

        {/* Brass/Steel Metallic Casing */}
        <circle
          cx="60"
          cy="60"
          r="58"
          fill="url(#radarBevelGrad)"
          stroke="#0f172a"
          strokeWidth="3"
        />

        {/* Top Push Button */}
        <rect
          x="52"
          y="0"
          width="16"
          height="8"
          rx="2"
          fill="#cbd5e1"
          stroke="#334155"
          strokeWidth="1.5"
        />

        {/* CRT Radar Screen */}
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="url(#radarScreenGrad)"
          stroke={isSummonReady ? "#eab308" : "#16a34a"}
          strokeWidth={isSummonReady ? "2.5" : "1.5"}
          className={isSummonReady ? "animate-pulse" : ""}
        />

        {/* Green Phosphor Grid Lines */}
        <circle
          cx="60"
          cy="60"
          r="36"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.8"
          opacity="0.4"
        />
        <circle
          cx="60"
          cy="60"
          r="24"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.8"
          opacity="0.4"
        />
        <circle
          cx="60"
          cy="60"
          r="12"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.8"
          opacity="0.4"
        />
        <line x1="12" y1="60" x2="108" y2="60" stroke="#22c55e" strokeWidth="0.8" opacity="0.4" />
        <line x1="60" y1="12" x2="60" y2="108" stroke="#22c55e" strokeWidth="0.8" opacity="0.4" />

        {/* Player Triangle Pip (Center) */}
        <polygon
          points="60,54 65,64 60,61 55,64"
          fill="#fbbf24"
          stroke="#d97706"
          strokeWidth="0.5"
        />

        {/* 7 Dragon Ball Orbs around radar screen */}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const angle = (i * 2 * Math.PI) / 7 - Math.PI / 2;
          const cx = 60 + 36 * Math.cos(angle);
          const cy = 60 + 36 * Math.sin(angle);
          const active = i < safeCount;

          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={active ? 4.5 : 3}
              fill={active ? "#f97316" : "#1e293b"}
              stroke={active ? "#fef08a" : "#334155"}
              strokeWidth="1"
              className={active ? "animate-ping-slow" : "opacity-50"}
            />
          );
        })}
      </svg>

      {/* Shenron Summon Banner */}
      <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400">
        {isSummonReady ? "SHENRON READY (7/7)" : `DRAGON BALLS : ${safeCount}/7`}
      </span>
    </div>
  );
}
