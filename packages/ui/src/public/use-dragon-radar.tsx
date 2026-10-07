// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useState } from "react";

export type SearchScope = "all" | "canon" | "manga" | "anime" | "lore";
export interface RadarResults {
  characters: {
    id: number;
    name: string;
    slug?: string;
    image?: string | null;
    description?: string | null;
  }[];
  techniques: { id: number; name: string; slug: string; type?: string | null }[];
  transformations: {
    id: number;
    name: string;
    character_id: number;
    slug?: string;
    ki?: string | null;
  }[];
  sagas: { id: number; name: string; slug: string }[];
  episodes: { id: number; episode_number: number; title: string; series?: string | null }[];
  movies: { id: number; title: string; release_year?: number | null }[];
  mangaChapters: {
    id: number;
    chapter_number: number | null;
    title: string | null;
    series?: string | null;
  }[];
  mangaVolumes: {
    id: number;
    volume_number: number | null;
    title: string | null;
    series?: string | null;
    cover?: string | null;
  }[];
  battles: { id: number; name: string; slug?: string }[];
  tournaments: { id: number; name: string; slug?: string }[];
}
export interface RadarVerdict {
  nature: "verdict" | "troll" | "inconnu";
  verdict: string;
  explanation: string;
  tier: string;
  tierLabel: string;
  score: number;
  color: string;
  sources?: string[];
}
export interface RadarTransport {
  search(query: string, signal: AbortSignal): Promise<RadarResults>;
  canon(query: string, signal: AbortSignal): Promise<RadarVerdict | null>;
}
interface SearchState {
  key: string;
  source: RadarTransport;
  results: RadarResults | null;
  isLoading: boolean;
  error: boolean;
}
interface CanonState {
  key: string;
  source: RadarTransport;
  canonData: RadarVerdict | null;
  canonLoading: boolean;
  canonError: boolean;
}
const emptySearch = (key: string, source: RadarTransport, pending: boolean): SearchState => ({
  key,
  source,
  results: null,
  isLoading: pending,
  error: false,
});
const emptyCanon = (key: string, source: RadarTransport, pending: boolean): CanonState => ({
  key,
  source,
  canonData: null,
  canonLoading: pending,
  canonError: false,
});
/** Bound even transports which fail to honor their cancellation signal. */
function deadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  parent: AbortSignal,
  milliseconds: number,
): Promise<T> {
  const controller = new AbortController();
  let cancel!: () => void;
  let timer!: ReturnType<typeof setTimeout>;
  const bounded = new Promise<T>((resolve, reject) => {
    cancel = () => {
      controller.abort();
      reject(new Error("Search cancelled"));
    };
    parent.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Search timed out"));
    }, milliseconds);
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw new Error("Search cancelled");
        return run(controller.signal);
      })
      .then(resolve, reject);
    if (parent.aborted) cancel();
  });
  return bounded.finally(() => {
    clearTimeout(timer);
    parent.removeEventListener("abort", cancel);
  });
}

export function useDragonRadar(
  query: string,
  scope: SearchScope,
  transport: RadarTransport,
  timeoutMs = 10_000,
) {
  const [attempt, setAttempt] = useState(0);
  const wantsCanon = scope === "canon";
  const key = JSON.stringify([query, attempt]);
  const canonKey = JSON.stringify([query, attempt, wantsCanon]);
  const [search, setSearch] = useState<SearchState>(() =>
    emptySearch(key, transport, Boolean(query)),
  );
  const [canon, setCanon] = useState<CanonState>(() =>
    emptyCanon(canonKey, transport, Boolean(query && wantsCanon)),
  );
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const update = (patch: Partial<SearchState>) => {
      if (!controller.signal.aborted)
        setSearch((previous) => ({
          ...(previous.key === key && previous.source === transport
            ? previous
            : emptySearch(key, transport, true)),
          ...patch,
        }));
    };
    void deadline((signal) => transport.search(query, signal), controller.signal, timeoutMs).then(
      (results) => update({ results, isLoading: false }),
      () => update({ results: null, isLoading: false, error: true }),
    );
    return () => controller.abort();
  }, [query, transport, timeoutMs, key]);
  useEffect(() => {
    if (!query || !wantsCanon) return;
    const controller = new AbortController();
    const update = (patch: Partial<CanonState>) => {
      if (!controller.signal.aborted)
        setCanon((previous) => ({
          ...(previous.key === canonKey && previous.source === transport
            ? previous
            : emptyCanon(canonKey, transport, true)),
          ...patch,
        }));
    };
    void deadline((signal) => transport.canon(query, signal), controller.signal, timeoutMs).then(
      (canonData) => update({ canonData, canonLoading: false }),
      () => update({ canonData: null, canonLoading: false, canonError: true }),
    );
    return () => controller.abort();
  }, [query, wantsCanon, transport, timeoutMs, canonKey]);
  const currentSearch =
    search.key === key && search.source === transport
      ? search
      : emptySearch(key, transport, Boolean(query));
  const currentCanon =
    canon.key === canonKey && canon.source === transport
      ? canon
      : emptyCanon(canonKey, transport, Boolean(query && wantsCanon));
  return {
    results: currentSearch.results,
    isLoading: currentSearch.isLoading,
    error: currentSearch.error,
    canonData: wantsCanon ? currentCanon.canonData : null,
    canonLoading: wantsCanon && currentCanon.canonLoading,
    canonError: wantsCanon && currentCanon.canonError,
    retry: () => setAttempt((value) => value + 1),
  };
}
