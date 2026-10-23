"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";

const UNITS = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
] as const;

/**
 * Locale-aware formatters shared by the bot admin pages (numbers, dates,
 * durations, relative times). Replaces the French-only helpers of
 * `@/lib/admin-format` for these pages: the active interface language decides.
 */
export function useBotFormat() {
  const locale = useLocale();
  return useMemo(() => {
    const number = new Intl.NumberFormat(locale);
    const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const unit = (u: string) =>
      new Intl.NumberFormat(locale, { style: "unit", unit: u, unitDisplay: "narrow" });

    const toMs = (value: number | string | null | undefined): number | null => {
      if (value === null || value === undefined || value === "") return null;
      const ms = typeof value === "number" ? value : Date.parse(value);
      return Number.isFinite(ms) ? ms : null;
    };

    return {
      locale,
      number: (n: number | null | undefined) =>
        n === null || n === undefined || !Number.isFinite(n) ? "—" : number.format(n),
      dateTime: (value: number | string | null | undefined) => {
        const ms = toMs(value);
        return ms === null ? "—" : dateTime.format(ms);
      },
      date: (value: number | string | null | undefined) => {
        const ms = toMs(value);
        return ms === null ? "—" : date.format(ms);
      },
      /** « 2 h 5 min » : the two largest non-zero units. */
      duration: (ms: number | null | undefined) => {
        if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
        if (ms < 1000) return unit("millisecond").format(Math.round(ms));
        const parts: string[] = [];
        let rest = ms;
        for (const [name, size] of UNITS) {
          const count = Math.floor(rest / size);
          rest -= count * size;
          if (count > 0 && parts.length < 2) parts.push(unit(name).format(count));
        }
        return parts.join(" ");
      },
      relative: (value: number | string | null | undefined) => {
        const ms = toMs(value);
        if (ms === null || ms === 0) return "—";
        const diff = ms - Date.now();
        const abs = Math.abs(diff);
        for (const [name, size] of UNITS) {
          if (abs >= size || name === "second") {
            return relative.format(Math.round(diff / size), name);
          }
        }
        return "—";
      },
    };
  }, [locale]);
}
