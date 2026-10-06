// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Material 3 panel of the persistent chat memory: what the chat remembered about its owner,
 * searchable, each fact deletable, and a two-step "forget everything". Transport, labels and
 * availability are injected (no fetch, no text). Styles: `@shenron/ui/chat.css`.
 */
import { Banner, Button } from "@aphrody/m3-primitives";
import { Brain, CircleAlert, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ChatGroupStatus } from "./model";

export interface MemoryItem {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
}

/** Memory routes of the host API; every method resolves, never throws (`null`/`false` = failed). */
export interface MemoryTransport {
  list(query: { q?: string }): Promise<{ memories: MemoryItem[]; total: number } | null>;
  remove(id: string): Promise<boolean>;
  clear(): Promise<number | null>;
}

export interface MemoryLabels {
  title: string;
  description: string;
  searchLabel: string;
  searchPlaceholder: string;
  empty: string;
  noMatch: string;
  unavailable: string;
  checking: string;
  remove: string;
  clear: string;
  clearConfirm: string;
  cancel: string;
  failed: string;
  /** `n` memories in all. */
  total: (n: number) => string;
  /** Label of a tag (`profile`, `preference`, `remember`), the raw tag otherwise. */
  tag: (tag: string) => string;
}

export interface MemoryPanelProps {
  transport: MemoryTransport;
  labels: MemoryLabels;
  /** `memory` group of the local health; `null` while it is being checked. */
  memory: ChatGroupStatus | null;
  /** Changing it reloads the list (e.g. after a chat turn stored a fact). */
  refreshKey?: number;
  formatDate?: (iso: string) => string;
  className?: string;
}

export function MemoryPanel({
  transport,
  labels,
  memory,
  refreshKey = 0,
  formatDate,
  className,
}: MemoryPanelProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const on = memory?.available === true;

  const load = useCallback(
    async (q: string) => {
      const result = await transport.list(q ? { q } : {});
      if (!result) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setItems(result.memories);
      setTotal(result.total);
    },
    [transport],
  );

  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => void load(query.trim()), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [on, load, query, refreshKey]);

  async function remove(id: string) {
    setBusy(true);
    const ok = await transport.remove(id);
    setBusy(false);
    if (!ok) return setFailed(true);
    setItems((list) => list?.filter((m) => m.id !== id) ?? null);
    setTotal((n) => Math.max(0, n - 1));
  }

  async function clear() {
    setBusy(true);
    const deleted = await transport.clear();
    setBusy(false);
    setConfirming(false);
    if (deleted === null) return setFailed(true);
    setItems([]);
    setTotal(0);
  }

  return (
    <section
      className={[
        "shenron-chat flex flex-col gap-3 rounded-extra-large bg-surface-container-low p-4 text-on-surface",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-shenron-chat=""
      aria-labelledby="shenron-memory-title"
    >
      <header className="flex items-start gap-3">
        <Brain aria-hidden size={24} className="mt-0.5 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="shenron-memory-title" className="m-0 text-title-large">
            {labels.title}
          </h2>
          <p className="m-0 text-body-medium text-on-surface-variant">{labels.description}</p>
        </div>
      </header>

      {memory === null ? (
        <output className="m-0 block text-body-medium text-on-surface-variant">
          {labels.checking}
        </output>
      ) : !on ? (
        <Banner variant="default" showDot={false} icon={CircleAlert} role="status">
          <p className="m-0">{memory.reason ?? labels.unavailable}</p>
        </Banner>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="shenron-memory-q">
              {labels.searchLabel}
            </label>
            <input
              id="shenron-memory-q"
              type="search"
              className="h-12 flex-1 rounded-extra-large border-0 bg-surface-container-highest px-5 text-body-large text-on-surface outline-none placeholder:text-on-surface-variant focus-visible:outline-2 focus-visible:outline-primary"
              value={query}
              maxLength={200}
              placeholder={labels.searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
            {confirming ? (
              <div className="flex gap-2">
                <Button variant="text" size="lg" onClick={() => setConfirming(false)}>
                  {labels.cancel}
                </Button>
                <Button
                  variant="filled"
                  size="lg"
                  className="bg-error text-on-error"
                  disabled={busy}
                  onClick={() => void clear()}
                >
                  {labels.clearConfirm}
                </Button>
              </div>
            ) : (
              <Button
                variant="outlined"
                size="lg"
                disabled={busy || total === 0}
                onClick={() => setConfirming(true)}
              >
                {labels.clear}
              </Button>
            )}
          </div>

          {failed ? (
            <Banner variant="error" showDot={false} icon={CircleAlert}>
              <p className="m-0">{labels.failed}</p>
            </Banner>
          ) : null}

          {items === null ? null : items.length === 0 ? (
            <p className="m-0 text-body-medium text-on-surface-variant">
              {query.trim() ? labels.noMatch : labels.empty}
            </p>
          ) : (
            <>
              <p className="m-0 text-label-medium text-on-surface-variant">{labels.total(total)}</p>
              <ul className="m-0 flex max-h-[50dvh] list-none flex-col gap-1 overflow-y-auto p-0">
                {items.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start gap-3 rounded-large bg-surface-container px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="m-0 text-body-large break-words">{m.content}</p>
                      <p className="m-0 flex flex-wrap items-center gap-2 text-label-small text-on-surface-variant">
                        {m.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-small bg-secondary-container px-2 py-0.5 text-on-secondary-container"
                          >
                            {labels.tag(tag)}
                          </span>
                        ))}
                        {formatDate ? <span>{formatDate(m.createdAt)}</span> : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-on-surface-variant transition-colors duration-200 hover:bg-on-surface/8 disabled:cursor-default disabled:opacity-38"
                      aria-label={`${labels.remove}: ${m.content.slice(0, 60)}`}
                      disabled={busy}
                      onClick={() => void remove(m.id)}
                    >
                      <Trash2 aria-hidden size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
