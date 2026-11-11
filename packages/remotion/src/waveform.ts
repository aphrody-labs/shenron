// SPDX-License-Identifier: Apache-2.0
/**
 * packages/remotion/src/waveform.ts
 *
 * Real-time audio waveform synthesis and peak extraction for Dragon Ball episodes.
 */

export interface WaveformPoint {
  timeSec: number;
  amplitude: number;
}

export function generateWaveformPeaks(
  durationSeconds: number,
  pointsCount: number = 200,
): WaveformPoint[] {
  const points: WaveformPoint[] = [];
  const step = durationSeconds / pointsCount;

  for (let i = 0; i < pointsCount; i++) {
    const t = i * step;
    // Dragon Ball audio curve: dialogue valleys (0.2), ki aura power-up builds (0.6), battle shockwave peaks (0.9+)
    const base = 0.2 + Math.sin(t * 0.05) * 0.15;
    const battleSpike = Math.sin(t * 0.3) > 0.6 ? 0.45 : 0;
    const noise = Math.random() * 0.15;
    const amplitude = Math.min(1.0, Math.max(0.05, base + battleSpike + noise));

    points.push({ timeSec: t, amplitude });
  }

  return points;
}
