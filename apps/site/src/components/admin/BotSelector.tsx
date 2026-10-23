"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/admin-api";

export interface BotSummary {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  online: boolean;
  uptime: number | null;
  wsPing: number;
  intents: number;
  guildCount: number;
  commandCount: number;
}

interface BotsResponse {
  bots: BotSummary[];
}

/**
 * Keeps a value in sync with a query parameter of the URL (`?bot=`, `?tab=`).
 * The first render uses the default (identical on server and client, so no
 * hydration mismatch); the URL value is read right after mount.
 */
export function useSearchParamState(name: string, defaultValue: string) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const read = () =>
      setValue(new URLSearchParams(window.location.search).get(name) ?? defaultValue);
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [name, defaultValue]);

  const change = useCallback(
    (next: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set(name, next);
      window.history.replaceState({}, "", url);
      setValue(next);
    },
    [name],
  );

  return [value, change] as const;
}

/** `?bot=` of the URL (the legacy persona ids stay accepted as aliases). */
export function useBotId(defaultId = "shenron") {
  return useSearchParamState("bot", defaultId);
}

export function useBots() {
  return useQuery({
    queryKey: ["bots"],
    queryFn: () => api.get<BotsResponse>("/bots"),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

interface BotSelectorProps {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Selector of the unified Gateway client. Renders nothing when the bot exposes
 * a single identity: a one-button selector would only suggest a choice.
 */
export function BotSelector({ value, onChange, className }: BotSelectorProps) {
  const t = useTranslations("adminBot.selector");
  const { data, isLoading } = useBots();

  if (isLoading) {
    return (
      <div className={`flex gap-2 ${className ?? ""}`}>
        {["a", "b", "c"].map((k) => (
          <div key={k} className="h-10 w-32 animate-pulse rounded-lg bg-muted/40" />
        ))}
      </div>
    );
  }

  const bots = data?.bots ?? [];
  if (bots.length <= 1) return null;

  return (
    <div role="group" aria-label={t("label")} className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      {bots.map((b) => {
        const active = b.id === value;
        return (
          <button
            key={b.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(b.id)}
            title={b.online ? t("ping", { ping: b.wsPing }) : t("offline")}
            className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange ${
              active
                ? "border-dbz-orange bg-dbz-orange/10 text-dbz-orange"
                : "border-border bg-background/40 text-foreground/80 hover:border-foreground/30 hover:bg-card"
            }`}
          >
            {b.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.avatar}
                alt=""
                className={`h-6 w-6 rounded-full ${b.online ? "" : "grayscale"}`}
              />
            ) : (
              <span aria-hidden className="h-6 w-6 rounded-full bg-border" />
            )}
            <span className="font-medium">{b.name}</span>
            <span
              role="img"
              aria-label={b.online ? t("online") : t("offline")}
              className={`h-2 w-2 rounded-full ${b.online ? "bg-emerald-400" : "bg-red-500"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
