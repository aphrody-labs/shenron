// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Start page of the desktop app (Shenron Studio): the chat with the local Dragon Ball model as
 * the main surface (`@shenron/ui/chat` on the host API of shenron-server, same origin), then the
 * offline corpus search (/api/local/rag/search through the shenron-ffi engine), the manga
 * translation editor, the control panel and the public site (opened in the system browser).
 */
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { LocalHealthResponse } from "@shenron/api/contract";
import { ChatPanel, type ChatLabels } from "@shenron/ui/chat";
import { isTauri } from "@shenron/ui/studio/tauri-bridge";
import { createDesktopChatTransport } from "./desktop-chat-transport";

const PUBLIC_SITE = "https://dragonballfr.com";

interface LocalHit {
  rowid: string;
  kind: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
}

/** The local health, as far as this page reads it (older servers have no `groups`). */
type Health = Pick<LocalHealthResponse, "ok" | "version" | "profile" | "localRag"> &
  Partial<Pick<LocalHealthResponse, "localRagError" | "groups">>;

async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@aphrody/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function useChatLabels(): ChatLabels {
  const t = useTranslations("desktop.chat");
  return useMemo(
    () => ({
      title: t("title"),
      newConversation: t("newConversation"),
      conversations: t("conversations"),
      noConversations: t("noConversations"),
      historyUnavailable: t("historyUnavailable"),
      untitled: t("untitled"),
      welcomeTitle: t("welcomeTitle"),
      welcomeBody: t("welcomeBody"),
      placeholder: t("placeholder"),
      you: t("you"),
      assistant: t("assistant"),
      thinking: t("thinking"),
      sources: t("sources"),
      openSource: t("openSource"),
      checking: t("checking"),
      unavailableTitle: t("unavailableTitle"),
      unavailableBody: t("unavailableBody"),
      truncated: t("truncated"),
      stopped: t("stopped"),
      dismiss: t("dismiss"),
      errors: {
        unavailable: t("errors.unavailable"),
        http: t("errors.http"),
        error: t("errors.error"),
        aborted: t("errors.aborted"),
        unreachable: t("errors.unreachable"),
      },
    }),
    [t],
  );
}

export function DesktopHome() {
  const t = useTranslations("desktop");
  const locale = useLocale();
  const labels = useChatLabels();
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LocalHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);

  const transport = useMemo(
    () =>
      createDesktopChatTransport({
        baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
        lang: locale,
      }),
    [locale],
  );
  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    return (iso: string) => format.format(new Date(iso));
  }, [locale]);

  useEffect(() => {
    fetch("/api/local/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok && response.status !== 503) throw new Error(`HTTP ${response.status}`);
        setHealth((await response.json()) as Health);
        return undefined;
      })
      .catch(() => setOffline(true));
  }, []);

  // Without the local server (plain browser) or without `groups` (older server), the chat
  // and its history count as unavailable rather than checking forever.
  const unknown = { available: false } as const;
  const chatGroup = offline ? unknown : health ? (health.groups?.chat ?? unknown) : null;
  const historyGroup = offline
    ? unknown
    : health
      ? (health.groups?.conversations ?? unknown)
      : null;

  async function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(`/api/local/rag/search?q=${encodeURIComponent(q)}&limit=12`, {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        results?: LocalHit[];
        error?: string;
        tookMs?: number;
      };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setHits(body.results ?? []);
      setTookMs(body.tookMs ?? null);
    } catch (error) {
      setHits(null);
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-[var(--dbz-text-muted,#a39e93)]">
          {health
            ? t("status.summary", {
                version: health.version,
                profile: health.profile,
                rag: health.localRag ? t("status.ragOn") : t("status.ragOff"),
              })
            : offline
              ? t("status.offline")
              : t("status.connecting")}
        </p>
      </header>

      <ChatPanel
        transport={transport}
        labels={labels}
        chat={chatGroup}
        conversations={historyGroup}
        onOpenLink={(url) => void openExternal(url)}
        formatDate={formatDate}
      />

      <section className="card flex flex-col gap-4 p-6" aria-labelledby="local-search">
        <h2 id="local-search" className="text-xl font-bold">
          {t("search.title")}
        </h2>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={search}>
          <label className="sr-only" htmlFor="q">
            {t("search.label")}
          </label>
          <input
            id="q"
            className="input flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search.placeholder")}
            maxLength={600}
          />
          <button className="btn btn-primary" type="submit" disabled={searching || !query.trim()}>
            {searching ? t("search.searching") : t("search.submit")}
          </button>
        </form>
        {health && !health.localRag ? (
          <p role="alert">{t("search.unavailable", { reason: health.localRagError ?? "" })}</p>
        ) : null}
        {searchError ? <p role="alert">{t("search.failed", { reason: searchError })}</p> : null}
        {hits ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {tookMs !== null
                ? t("search.took", { count: hits.length, ms: tookMs })
                : t("search.count", { count: hits.length })}
            </p>
            <ol className="flex flex-col gap-3">
              {hits.map((hit) => (
                <li
                  key={hit.rowid}
                  className="flex flex-col gap-1 border-b border-[var(--dbz-border,#2a2a26)] pb-3"
                >
                  <button
                    type="button"
                    className="text-left font-semibold underline-offset-4 hover:underline"
                    onClick={() => void openExternal(hit.url)}
                  >
                    {hit.title}
                  </button>
                  <span className="text-xs uppercase tracking-wide">{hit.kind}</span>
                  <p className="text-sm">{hit.snippet}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label={t("tools.label")}>
        <Link href="/studio" className="card flex flex-col gap-2 p-6">
          <span className="text-lg font-bold">{t("tools.studioTitle")}</span>
          <span className="text-sm">{t("tools.studioText")}</span>
        </Link>
        <Link href="/desktop/control" className="card flex flex-col gap-2 p-6">
          <span className="text-lg font-bold">{t("tools.controlTitle")}</span>
          <span className="text-sm">{t("tools.controlText")}</span>
        </Link>
        <button
          type="button"
          className="card flex flex-col gap-2 p-6 text-left"
          onClick={() => void openExternal(PUBLIC_SITE)}
        >
          <span className="text-lg font-bold">dragonballfr.com</span>
          <span className="text-sm">{t("tools.siteText")}</span>
        </button>
      </section>
    </main>
  );
}
