"use client";

/**
 * Favoris — local d'abord, synchronisés en base pour les comptes connectés.
 *
 * « Local d'abord » n'est pas un raccourci : un visiteur anonyme doit pouvoir
 * mettre en favori sans créer de compte, et la lecture ne doit JAMAIS passer par
 * le serveur au rendu — une page qui lit la session bascule tout le site en
 * `no-store` (piège déjà rencontré avec la nav). Les boutons sont donc des îlots
 * clients, et le stockage de référence est `localStorage`.
 *
 * Pour un compte connecté, `/api/favorites` conserve la même liste dans
 * `public.user_preferences.prefs.favorites` (jsonb libre, aucune migration).
 * À la connexion, les deux côtés sont FUSIONNÉS et non écrasés : mettre en
 * favori depuis son téléphone puis se connecter sur l'ordinateur ne doit rien
 * effacer.
 */

const KEY = "dbfr_favorites_v1";
export const FAVORITES_EVENT = "dbfr:favorites";

import {
  sanitizeFavorites,
  type Favorite,
  type FavoriteKind,
} from "@aphrody/shenron-config/favorites";
export type { Favorite, FavoriteKind } from "@aphrody/shenron-config/favorites";

const favKey = (kind: FavoriteKind, id: string) => `${kind}:${id}`;

const isFavorite = (v: unknown): v is Favorite => {
  if (!v || typeof v !== "object") return false;
  const f = v as Partial<Favorite>;
  return (
    typeof f.id === "string" &&
    typeof f.title === "string" &&
    typeof f.href === "string" &&
    typeof f.at === "number" &&
    typeof f.kind === "string"
  );
};

export function readFavorites(): Favorite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isFavorite).toSorted((a, b) => b.at - a.at) : [];
  } catch {
    return [];
  }
}

function write(list: Favorite[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
  } catch {
    /* quota / navigation privée */
  }
  void push(list);
}

export function isFavorited(kind: FavoriteKind, id: string): boolean {
  const k = favKey(kind, id);
  return readFavorites().some((f) => favKey(f.kind, f.id) === k);
}

/** Bascule et renvoie le nouvel état. */
export function toggleFavorite(entry: Omit<Favorite, "at">): boolean {
  const k = favKey(entry.kind, entry.id);
  const current = readFavorites();
  const exists = current.some((f) => favKey(f.kind, f.id) === k);
  generation++;
  changedKeys.add(k);
  const removed = readRemoved();
  if (exists) removed.add(k);
  else removed.delete(k);
  persistRemoved(removed);
  write(
    exists
      ? current.filter((f) => favKey(f.kind, f.id) !== k)
      : [{ ...entry, at: Date.now() }, ...current],
  );
  return !exists;
}

// One read and one write at a time; local changes win until acknowledged.
const REMOVED_KEY = "dbfr_favorites_removed_v1";
const changedKeys = new Set<string>();
let generation = 0;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let synced = false;
let syncRequested = false;
let syncFlight: Promise<void> | null = null;
let writing = false;
let pending: { list: Favorite[]; generation: number } | null = null;

function readRemoved(): Set<string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(REMOVED_KEY) ?? "[]");
    return new Set(
      Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : [],
    );
  } catch {
    return new Set();
  }
}
function persistRemoved(keys: Set<string>): void {
  try {
    window.localStorage.setItem(REMOVED_KEY, JSON.stringify([...keys]));
  } catch {
    /* Keep local-first behavior when browser storage is unavailable. */
  }
}

function push(list: Favorite[]): void {
  if (typeof window === "undefined") return;
  if (!synced) {
    if (syncRequested) void syncFavorites();
    return;
  }
  pending = { list, generation };
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flush();
  }, 800);
}

async function flush(): Promise<void> {
  if (writing || pushTimer || !synced) return;
  writing = true;
  try {
    while (pending && synced) {
      if (pushTimer) break;
      const snapshot = pending;
      pending = null;
      const body = JSON.stringify({ favorites: sanitizeFavorites(snapshot.list) });
      const response = await fetch("/api/favorites", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body,
        signal: AbortSignal.timeout(10_000),
        // Keepalive has a shared 64 KiB body budget in browsers.
        keepalive: new TextEncoder().encode(body).byteLength <= 64 * 1024,
      });
      if (!response.ok) {
        synced = false;
        break;
      }
      if (snapshot.generation === generation && !pending) {
        changedKeys.clear();
        persistRemoved(new Set());
      }
    }
  } catch {
    synced = false;
  } finally {
    writing = false;
    if (pending && !pushTimer) {
      if (synced) void flush();
      else if (syncRequested) void syncFavorites();
    }
  }
}

/** Coalesce callers; a failed read remains retryable on the next authorized interaction. */
export async function syncFavorites(): Promise<void> {
  if (typeof window === "undefined") return;
  syncRequested = true;
  if (synced) return;
  if (syncFlight) return syncFlight;
  syncFlight = synchronize().finally(() => {
    syncFlight = null;
  });
  return syncFlight;
}

async function synchronize(): Promise<void> {
  try {
    const res = await fetch("/api/favorites", {
      credentials: "include",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { favorites?: unknown };
    if (!Array.isArray(data.favorites)) return;
    const removed = readRemoved();
    const remote = data.favorites.filter(isFavorite).filter((favorite) => {
      const key = favKey(favorite.kind, favorite.id);
      return !removed.has(key) && !changedKeys.has(key);
    });
    const byKey = new Map<string, Favorite>();
    for (const f of [...remote, ...readFavorites()]) {
      const k = favKey(f.kind, f.id);
      const prev = byKey.get(k);
      if (!prev || f.at > prev.at) byKey.set(k, f);
    }
    const merged = [...byKey.values()].toSorted((a, b) => b.at - a.at);
    window.localStorage.setItem(KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
    synced = true;
    void push(merged);
  } catch {
    /* Keep the local snapshot and pending deletions after a failure. */
  }
}
