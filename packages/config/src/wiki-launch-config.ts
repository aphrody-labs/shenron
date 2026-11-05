// SPDX-License-Identifier: Apache-2.0
import {
  ALL_ENTRIES,
  ALWAYS_OPEN_KEYS,
  DEFAULT_OPEN_KEYS,
  GATEABLE_CATEGORIES,
  currentEntryKey,
  type AccessMode,
  type AccessRule,
} from "./wiki-launch";

export interface LaunchConfig {
  /** Catégories wiki publiques (héritage bêta — sert encore la nav et le teaser). */
  openKeys: string[];
  /** Ordre d'affichage des rubriques (nav + admin). */
  order: string[];
  /** Règle d'accès par clé ; absent = comportement dérivé (cf. `resolveAccess`). */
  access: Record<string, AccessRule>;
}

/** Clés valides ouvrables (garde-fou contre des clés obsolètes en base). */
const GATEABLE_KEYS = new Set(GATEABLE_CATEGORIES.map((c) => c.key));
const KNOWN_KEYS = new Set(ALL_ENTRIES.map((e) => e.key));
const ALWAYS_OPEN = new Set(ALWAYS_OPEN_KEYS);
const MODES: ReadonlySet<string> = new Set<AccessMode>(["public", "members", "roles", "admin"]);

/** Clés lues en base, anciennes clés françaises ramenées à la clé actuelle. */
function currentKeys(arr: unknown[]): string[] {
  return arr.filter((k): k is string => typeof k === "string").map(currentEntryKey);
}

function sanitizeOpenKeys(stored: unknown): string[] {
  const arr = Array.isArray((stored as { openKeys?: unknown })?.openKeys)
    ? ((stored as { openKeys: unknown[] }).openKeys as unknown[])
    : [];
  const extra = currentKeys(arr).filter((k) => GATEABLE_KEYS.has(k));
  // alwaysOpen toujours inclus ; dédoublonné.
  return Array.from(new Set([...ALWAYS_OPEN_KEYS, ...extra]));
}

function sanitizeOrder(stored: unknown): string[] {
  const arr = Array.isArray((stored as { order?: unknown })?.order)
    ? ((stored as { order: unknown[] }).order as unknown[])
    : [];
  return Array.from(new Set(currentKeys(arr).filter((k) => KNOWN_KEYS.has(k))));
}

function sanitizeAccess(stored: unknown): Record<string, AccessRule> {
  const raw = (stored as { access?: unknown })?.access;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, AccessRule> = {};
  // Une règle enregistrée sous la clé actuelle l'emporte sur celle de l'ancienne clé
  // française : les anciennes passent d'abord, les actuelles les écrasent.
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([storedKey, value]) => ({ stored: storedKey, key: currentEntryKey(storedKey), value }))
    .toSorted((a, b) => Number(a.stored === a.key) - Number(b.stored === b.key));
  for (const { key, value } of entries) {
    // Clé obsolète, ou rubrique verrouillée publique (bêta) → on ignore la règle
    // plutôt que de la persister : elle ne serait jamais appliquée.
    if (!KNOWN_KEYS.has(key) || ALWAYS_OPEN.has(key)) continue;
    const mode = (value as { mode?: unknown })?.mode;
    if (typeof mode !== "string" || !MODES.has(mode)) continue;
    const ids = Array.isArray((value as { roleIds?: unknown })?.roleIds)
      ? ((value as { roleIds: unknown[] }).roleIds as unknown[])
      : [];
    const roleIds = Array.from(
      new Set(ids.filter((r): r is string => typeof r === "string" && /^\d{17,20}$/.test(r))),
    );
    // Mode « rôles » sans aucun rôle = piège à trou de sécurité inverse (personne
    // ne passe, y compris le staff qui croyait avoir ouvert) → on retombe sur
    // « connectés », intention la plus proche.
    out[key] = {
      mode: mode === "roles" && roleIds.length === 0 ? "members" : (mode as AccessMode),
      roleIds,
    };
  }
  return out;
}

export function resolveLaunchConfig(stored: unknown): LaunchConfig {
  return {
    openKeys: sanitizeOpenKeys(stored),
    order: sanitizeOrder(stored),
    access: sanitizeAccess(stored),
  };
}

export const DEFAULT_LAUNCH_CONFIG: LaunchConfig = {
  openKeys: DEFAULT_OPEN_KEYS,
  order: [],
  access: {},
};
