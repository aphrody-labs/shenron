// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { env } from "./env";
import { createCanonEvidenceGate } from "./canon-yolo-gate";
import { createMemoryRateLimiter } from "./memory-rate-limit";

const spacing = createMemoryRateLimiter({
  windowMs: env.SHENRON_CANON_YOLO_MIN_SPACING_MS,
  limit: 1,
  namespace: "canon-evidence-spacing",
});
const hourly = createMemoryRateLimiter({
  windowMs: 3_600_000,
  limit: env.SHENRON_CANON_YOLO_PER_HOUR,
  namespace: "canon-evidence-hour",
});
const daily = createMemoryRateLimiter({
  windowMs: 86_400_000,
  limit: env.SHENRON_CANON_YOLO_PER_DAY,
  namespace: "canon-evidence-day",
});

export function isCanonEvidenceEnabled(): boolean {
  return (
    env.SHENRON_CANON_YOLO_ENABLED === "1" &&
    !!env.TYPESAFE_API_KEY &&
    !!env.SHENRON_CANON_YOLO_MODEL
  );
}

export const canonEvidenceDecision = createCanonEvidenceGate(
  {
    enabled: isCanonEvidenceEnabled(),
    configured: !!env.TYPESAFE_API_KEY && !!env.SHENRON_CANON_YOLO_MODEL,
    model: env.SHENRON_CANON_YOLO_MODEL ?? "",
    minimumConfidence: env.SHENRON_CANON_YOLO_MIN_CONFIDENCE,
    timeout: env.SHENRON_CANON_YOLO_TIMEOUT_MS,
    perHour: env.SHENRON_CANON_YOLO_PER_HOUR,
    perDay: env.SHENRON_CANON_YOLO_PER_DAY,
    minimumSpacingMs: env.SHENRON_CANON_YOLO_MIN_SPACING_MS,
  },
  {
    runtime: () => import("@aphrody/bun-runtime-sdk/yolo"),
    async admit() {
      for (const limiter of [spacing, hourly, daily]) {
        if ((await limiter.consume("global")).limited) return false;
      }
      return true;
    },
  },
);
