// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Start page of the desktop app (Shenron Studio): the chat with the local Dragon Ball model as
 * the main surface (`@shenron/ui/chat` on the host API of shenron-server, same origin), then the
 * offline corpus search (/api/local/rag/search through the shenron-ffi engine), the manga
 * translation editor, the control panel and the public site (opened in the system browser).
 */
import Link from "next/link";
import { DiscordInviteFAB } from "@/components/DiscordInviteFAB";
import { ReportButton } from "@/components/ReportButton";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { startHealthPolling } from "@shenron/ui/public/health-poll";
import type { LocalHealthResponse } from "@shenron/api/contract";
import {
  ChatPanel,
  type ChatLabels,
  type ChatModelView,
  MemoryPanel,
  type MemoryLabels,
  type ModelsLabels,
  ModelsPanel,
  type PickAdapterPath,
} from "@shenron/ui/chat";
import { isTauri, nativeOpenDialog } from "@shenron/ui/studio/tauri-bridge";
import {
  createDesktopChatTransport,
  createDesktopMemoryTransport,
  createDesktopModelsTransport,
} from "./desktop-chat-transport";

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
      memoryUsed: ({ recalled, stored }) =>
        [
          recalled > 0 ? t("memoryRecalled", { count: recalled }) : null,
          stored > 0 ? t("memoryStored", { count: stored }) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      modelProvider: (model) => (model.remote ? t("modelRemote") : t("modelLocal")),
    }),
    [t],
  );
}

/** Byte count in the reader's language ("1,2 Go", "850 MB"). */
function formatBytes(locale: string, bytes: number): string {
  const [value, unit] =
    bytes >= 1e9
      ? [bytes / 1e9, "gigabyte"]
      : bytes >= 1e6
        ? [bytes / 1e6, "megabyte"]
        : [bytes / 1e3, "kilobyte"];
  return new Intl.NumberFormat(locale, { style: "unit", unit, maximumFractionDigits: 1 }).format(
    value,
  );
}

function useModelsLabels(locale: string): ModelsLabels {
  const t = useTranslations("desktop.models");
  const errors = useTranslations("error");
  return useMemo(
    () => ({
      title: t("title"),
      description: t("description"),
      checking: t("checking"),
      unavailable: t("unavailable"),
      failed: t("failed"),
      retry: errors("retry"),
      empty: t("empty"),
      defaultBadge: t("defaultBadge"),
      local: t("local"),
      remote: t("remote"),
      states: {
        ready: t("states.ready"),
        loading: t("states.loading"),
        downloading: t("states.downloading"),
        installable: t("states.installable"),
        failed: t("states.failed"),
        unavailable: t("states.unavailable"),
      },
      install: t("install"),
      importAdapter: t("importAdapter"),
      chooseFile: t("chooseFile"),
      pathLabel: t("pathLabel"),
      pathPlaceholder: t("pathPlaceholder"),
      importSubmit: t("importSubmit"),
      importFailed: t("importFailed"),
      progress: (received: number, total: number | null) =>
        total
          ? t("progressKnown", {
              received: formatBytes(locale, received),
              total: formatBytes(locale, total),
            })
          : t("progressUnknown", { received: formatBytes(locale, received) }),
      eta: (seconds: number) => t("eta", { minutes: Math.max(1, Math.ceil(seconds / 60)) }),
    }),
    [t, errors, locale],
  );
}

/** Native file dialog of Shenron Studio for the adapter; undefined outside Tauri. */
const pickAdapterPath: PickAdapterPath = async () => {
  const outcome = await nativeOpenDialog({ filters: [{ name: "GGUF", extensions: ["gguf"] }] });
  if (outcome.status === "unavailable") return undefined;
  return outcome.status === "picked" ? (outcome.value[0] ?? null) : null;
};

const MEMORY_TAGS = new Set(["profile", "preference", "remember"]);

function useMemoryLabels(): MemoryLabels {
  const t = useTranslations("desktop.memory");
  return useMemo(
    () => ({
      title: t("title"),
      description: t("description"),
      searchLabel: t("searchLabel"),
      searchPlaceholder: t("searchPlaceholder"),
      empty: t("empty"),
      noMatch: t("noMatch"),
      unavailable: t("unavailable"),
      checking: t("checking"),
      remove: t("remove"),
      clear: t("clear"),
      clearConfirm: t("clearConfirm"),
      cancel: t("cancel"),
      failed: t("failed"),
      total: (count) => t("total", { count }),
      tag: (tag) =>
        MEMORY_TAGS.has(tag) ? t(`tags.${tag as "profile" | "preference" | "remember"}`) : tag,
    }),
    [t],
  );
}

export function DesktopHome() {
  const t = useTranslations("desktop");
  const locale = useLocale();
  const labels = useChatLabels();
  const memoryLabels = useMemoryLabels();
  const [memoryRefresh, setMemoryRefresh] = useState(0);
  const modelsLabels = useModelsLabels(locale);
  const [modelsKey, setModelsKey] = useState(0);
  const [tauri, setTauri] = useState(false);
  useEffect(() => setTauri(isTauri()), []);
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
  const memoryTransport = useMemo(
    () =>
      createDesktopMemoryTransport({
        baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
      }),
    [],
  );
  const modelsTransport = useMemo(
    () =>
      createDesktopModelsTransport({
        baseUrl: typeof window === "undefined" ? "http://localhost" : window.location.origin,
      }),
    [],
  );
  // The chat selector reloads only when the set of usable models changes, not at every poll.
  const usableModels = useRef("");
  // First launch: every local model downloads by itself, one after the other (the default one
  // first, started by the server), without a click. Once per model and per window.
  const autoInstalled = useRef(new Set<string>());
  const onModelsChange = useCallback(
    (models: ChatModelView[]) => {
      if (!models.some((m) => m.state === "downloading" || m.state === "loading")) {
        const next = models.find(
          (m) =>
            !m.remote &&
            m.state === "installable" &&
            m.installUrl &&
            !autoInstalled.current.has(m.id),
        );
        if (next) {
          autoInstalled.current.add(next.id);
          void modelsTransport.install(next);
        }
      }
      const usable = models
        .filter((m) => m.available)
        .map((m) => m.id)
        .join(",");
      if (usable === usableModels.current) return;
      usableModels.current = usable;
      setModelsKey((n) => n + 1);
    },
    [modelsTransport],
  );
  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
    return (iso: string) => format.format(new Date(iso));
  }, [locale]);

  useEffect(
    () =>
      startHealthPolling<Health>({
        async load(signal) {
          const response = await fetch("/api/local/health", { cache: "no-store", signal });
          if (!response.ok && response.status !== 503) throw new Error("Health unavailable");
          return response.json();
        },
        onUpdate(value) {
          setHealth(value);
          setOffline(false);
        },
        onError() {
          setOffline(true);
        },
        shouldPoll(value) {
          return (
            value.groups?.chat?.available === false || value.groups?.models?.available === false
          );
        },
      }),
    [],
  );

  // Without the local server (plain browser) or without `groups` (older server), the chat
  // and its history count as unavailable rather than checking forever.
  const unknown = { available: false } as const;
  const chatGroup = offline ? unknown : health ? (health.groups?.chat ?? unknown) : null;
  const historyGroup = offline
    ? unknown
    : health
      ? (health.groups?.conversations ?? unknown)
      : null;

  const modelsGroup = offline ? unknown : health ? (health.groups?.models ?? unknown) : null;
  const memoryGroup = offline ? unknown : health ? (health.groups?.memory ?? unknown) : null;

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
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <span className="capsule-badge">
            <span
              className={`capsule-led ${
                offline
                  ? "bg-red-500 shadow-red-500"
                  : "bg-emerald-400 shadow-emerald-400"
              }`}
            />
            {tauri ? "Shenron Studio Desktop" : "Web ↔ Desktop Bridge"}
          </span>
          {health?.localRag ? (
            <span className="badge badge-success text-[10px]">
              RAG Local Actif
            </span>
          ) : null}
        </div>
        <div className="workspace-actions flex flex-wrap items-center gap-4 pt-2">
          <DiscordInviteFAB inline />
          <ReportButton inline />
        </div>
      </header>

      <ChatPanel
        transport={transport}
        labels={labels}
        chat={chatGroup}
        conversations={historyGroup}
        onOpenLink={(url) => void openExternal(url)}
        formatDate={formatDate}
        onTurnDone={(memory) => {
          if (memory && memory.stored > 0) setMemoryRefresh((n) => n + 1);
        }}
        modelsKey={modelsKey}
      />

      <ModelsPanel
        transport={modelsTransport}
        labels={modelsLabels}
        models={modelsGroup}
        {...(tauri ? { pickAdapterPath } : {})}
        onChange={onModelsChange}
      />

      <MemoryPanel
        transport={memoryTransport}
        labels={memoryLabels}
        memory={memoryGroup}
        refreshKey={memoryRefresh}
        formatDate={formatDate}
      />

      <section className="toriyama-panel flex flex-col gap-4 p-6" aria-labelledby="local-search">
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
        <Link
          href="/studio"
          className="toriyama-panel group flex flex-col gap-2 p-6 transition-all hover:border-dbz-yellow hover:shadow-[3px_3px_0px_#000]"
        >
          <span className="text-lg font-bold transition-colors group-hover:text-dbz-orange">
            {t("tools.studioTitle")}
          </span>
          <span className="text-sm text-os/80">{t("tools.studioText")}</span>
        </Link>
        <Link
          href="/desktop/control"
          className="toriyama-panel group flex flex-col gap-2 p-6 transition-all hover:border-dbz-yellow hover:shadow-[3px_3px_0px_#000]"
        >
          <span className="text-lg font-bold transition-colors group-hover:text-dbz-orange">
            {t("tools.controlTitle")}
          </span>
          <span className="text-sm text-os/80">{t("tools.controlText")}</span>
        </Link>
        <button
          type="button"
          className="toriyama-panel group flex flex-col gap-2 p-6 text-left transition-all hover:border-dbz-yellow hover:shadow-[3px_3px_0px_#000]"
          onClick={() => void openExternal(PUBLIC_SITE)}
        >
          <span className="text-lg font-bold transition-colors group-hover:text-dbz-orange">
            dragonballfr.com
          </span>
          <span className="text-sm text-os/80">{t("tools.siteText")}</span>
        </button>
      </section>
    </main>
  );
}
