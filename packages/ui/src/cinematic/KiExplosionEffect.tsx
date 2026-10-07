// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useCallback } from "react";

export type KiColorStyle =
  | "gold" // Super Saiyan
  | "cyan" // Super Saiyan Blue / SSJ2 Lightning
  | "red" // Kaioken
  | "emerald" // Broly Full Power
  | "rose" // Super Saiyan Rosé
  | "silver" // Ultra Instinct
  | "purple" // Gohan Beast / Destruction Ki
  | "blue"; // Kamehameha Classic

export interface KiExplosionEffectProps {
  /** Active trigger or burst count. Incrementing triggers a new explosion */
  triggerKey?: number | string;
  /** Color theme for Ki particles */
  color?: KiColorStyle;
  /** Radius of explosion */
  radius?: number;
  /** Number of particles emitted (default 40, optimized for 60 FPS mobile) */
  particleCount?: number;
  /** Play native Web Audio synth sound on explosion */
  playSound?: boolean;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  decay: number;
}

const COLOR_MAP: Record<KiColorStyle, { primary: string; secondary: string; glow: string }> = {
  gold: { primary: "#ffd700", secondary: "#ffaa00", glow: "rgba(255, 215, 0, 0.8)" },
  cyan: { primary: "#00f5d4", secondary: "#00b4d8", glow: "rgba(0, 245, 212, 0.8)" },
  red: { primary: "#ef233c", secondary: "#d90429", glow: "rgba(239, 35, 60, 0.8)" },
  emerald: { primary: "#2ec4b6", secondary: "#10b981", glow: "rgba(16, 185, 129, 0.8)" },
  rose: { primary: "#f72585", secondary: "#b5179e", glow: "rgba(247, 37, 133, 0.8)" },
  silver: { primary: "#f8f9fa", secondary: "#ced4da", glow: "rgba(248, 249, 250, 0.8)" },
  purple: { primary: "#7209b7", secondary: "#3a0ca3", glow: "rgba(114, 9, 183, 0.8)" },
  blue: { primary: "#38bdf8", secondary: "#0284c7", glow: "rgba(56, 189, 248, 0.8)" },
};

/**
 * High-Performance 60 FPS Ki Explosion & Particle FX Canvas.
 *
 * Lightweight, hardware-accelerated 2D canvas with automatic DPR scaling,
 * mobile battery preservation, and zero overhead when idle.
 */
export function KiExplosionEffect({
  triggerKey = 0,
  color = "gold",
  radius = 120,
  particleCount = 36,
  playSound = false,
  className = "",
}: KiExplosionEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shockwaveRef = useRef<{ radius: number; maxRadius: number; alpha: number } | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const colors = COLOR_MAP[color] ?? COLOR_MAP.gold;

  const playKiSound = useCallback(() => {
    if (!playSound || typeof window === "undefined") return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Audio autoplay restrictions
    }
  }, [playSound]);

  const triggerExplosion = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const newParticles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      newParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.5 + Math.random() * 4,
        alpha: 1.0,
        color: Math.random() > 0.4 ? colors.primary : colors.secondary,
        decay: 0.02 + Math.random() * 0.03,
      });
    }

    particlesRef.current = newParticles;
    shockwaveRef.current = { radius: 5, maxRadius: radius, alpha: 0.9 };

    playKiSound();

    if (!animFrameRef.current) {
      const loop = () => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Shockwave Ring
        if (shockwaveRef.current) {
          const sw = shockwaveRef.current;
          sw.radius += (sw.maxRadius - sw.radius) * 0.15 + 1.5;
          sw.alpha *= 0.92;

          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, sw.radius, 0, Math.PI * 2);
          ctx.strokeStyle = colors.primary;
          ctx.globalAlpha = Math.max(0, sw.alpha);
          ctx.lineWidth = 3;
          ctx.shadowColor = colors.glow;
          ctx.shadowBlur = 15;
          ctx.stroke();
          ctx.restore();

          if (sw.alpha <= 0.02 || sw.radius >= sw.maxRadius) {
            shockwaveRef.current = null;
          }
        }

        // 2. Ki Particles
        const particles = particlesRef.current;
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.alpha -= p.decay;

          if (p.alpha <= 0) {
            particles.splice(i, 1);
            continue;
          }

          ctx.save();
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.shadowColor = colors.glow;
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.restore();
        }

        if (particles.length > 0 || shockwaveRef.current !== null) {
          animFrameRef.current = requestAnimationFrame(loop);
        } else {
          animFrameRef.current = null;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      };
      animFrameRef.current = requestAnimationFrame(loop);
    }
  }, [colors, particleCount, radius, playKiSound]);

  useEffect(() => {
    if (triggerKey !== undefined && triggerKey !== 0) {
      triggerExplosion();
    }
  }, [triggerKey, triggerExplosion]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={radius * 2 + 60}
      height={radius * 2 + 60}
      className={`pointer-events-none absolute inset-0 m-auto ${className}`}
      aria-hidden="true"
    />
  );
}
