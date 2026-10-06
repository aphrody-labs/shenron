// SPDX-License-Identifier: Apache-2.0
/**
 * Agent homes of Shenron's users: one instance of the public template `templates/agent-home`
 * per user, in the native format of Aphrody's `aphrody-agent-home` (the seven documents of its
 * `sync-contract.json`, the user's fields in the `USER.md` frontmatter that its `UserProfile`
 * parses). Ids are `discord:<user_id>` once the user is known through Discord, `local` for the
 * anonymous home of a desktop install before sign-in.
 *
 * A home exists in two places with the same contract: files on the user's machine (desktop,
 * `./dir.ts`) and PostgreSQL in the cloud (bot DMs, `chat.agent_homes`, `./pg.ts`). When one
 * user has both, they converge last-writer-wins on `updatedAt` (ties broken by content), like
 * the conversation store. Runtime class: `pure`.
 */

/** The seven documents of an agent home, in prompt injection order (`sync-contract.json`). */
export const AGENT_HOME_DOCUMENTS = [
  "AGENTS.md",
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "BOOT.md",
] as const;
export type AgentHomeDocument = (typeof AGENT_HOME_DOCUMENTS)[number];

export const AGENT_HOME_LANGUAGES = ["fr", "en", "ja"] as const;
export type AgentHomeLanguage = (typeof AGENT_HOME_LANGUAGES)[number];

/** Id of the anonymous home of a desktop install. */
export const LOCAL_AGENT_ID = "local";

export const AGENT_HOME_LIMITS = {
  name: 64,
  preferences: 20,
  preference: 200,
  avatar: 512,
  /** Per-document cap (`aphrody-agent-home` MAX_WORKSPACE_BOOTSTRAP_FILE_BYTES is 2 MiB). */
  documentBytes: 256 * 1024,
} as const;

const DISCORD_ID = /^\d{15,22}$/;
const AGENT_ID = /^(?:local|discord:\d{15,22})$/;

/** The user's fields of an agent home (`USER.md` frontmatter). */
export interface AgentHomeProfile {
  agentId: string;
  /** Name or nickname the agent addresses the user by. */
  name: string | null;
  language: AgentHomeLanguage;
  /** IANA timezone. */
  timezone: string | null;
  preferences: string[];
  /** `https:` avatar URL (Discord CDN). */
  avatarUrl: string | null;
}

/** Fields a caller may give; everything is normalised by {@link normalizeProfile}. */
export interface AgentHomeProfileInput {
  agentId: string;
  name?: string | null;
  language?: string | null;
  timezone?: string | null;
  preferences?: readonly string[] | null;
  avatarUrl?: string | null;
}

/** One agent home: its documents and the facts the stores index. */
export interface AgentHomeSnapshot {
  agentId: string;
  profile: AgentHomeProfile;
  /** The seven documents, full Markdown. */
  files: Record<AgentHomeDocument, string>;
  /** Revision of the template the home was instantiated from. */
  templateRevision: string;
  createdAt: string;
  updatedAt: string;
}

/** The public template: its documents and their revision. */
export interface AgentHomeTemplate {
  revision: string;
  files: Record<AgentHomeDocument, string>;
}

export type AgentHomePutResult = "accepted" | "stale";

/** Persistence of agent homes (desktop files, cloud PostgreSQL). */
export interface AgentHomeStore {
  get(agentId: string): Promise<AgentHomeSnapshot | null>;
  /** Write a snapshot unless the stored one is newer (last-writer-wins on `updatedAt`). */
  put(home: AgentHomeSnapshot): Promise<AgentHomePutResult>;
}

export function isAgentHomeId(id: string): boolean {
  return AGENT_ID.test(id);
}

/** `discord:<user_id>` for a valid Discord id, else `local`. */
export function agentHomeId(discordId?: string | null): string {
  const id = discordId?.trim();
  return id && DISCORD_ID.test(id) ? `discord:${id}` : LOCAL_AGENT_ID;
}

/** Discord id of a `discord:<user_id>` home, `null` for `local`. */
export function discordIdOf(agentId: string): string | null {
  return agentId.startsWith("discord:") && isAgentHomeId(agentId) ? agentId.slice(8) : null;
}

/**
 * Directory name of a home, `aphrody-agent-home`'s `sanitize_profile`: ASCII alphanumerics,
 * `-` and `_` kept and lowercased, anything else mapped to `-`, edges trimmed
 * (`discord:123` → `discord-123`).
 */
export function agentHomeDirName(agentId: string): string {
  let out = "";
  for (const ch of agentId.trim()) out += /^[A-Za-z0-9_-]$/.test(ch) ? ch.toLowerCase() : "-";
  return out.replace(/^-+|-+$/g, "");
}

// oxlint-disable-next-line no-control-regex -- control characters are what this strips
const CONTROL = /[\u0000-\u001f\u007f]/g;
const clean = (value: string | null | undefined, max: number): string | null => {
  const text = value?.replace(CONTROL, " ").replaceAll('"', "'").trim().slice(0, max).trim();
  return text ? text : null;
};

function validTimezone(tz: string | null): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function validAvatar(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Preferred language among `fr | en | ja` (a locale such as `en-US` counts), else `fr`. */
export function homeLanguage(value: string | null | undefined): AgentHomeLanguage {
  const base = value?.trim().toLowerCase().split(/[-_]/)[0];
  return (AGENT_HOME_LANGUAGES as readonly string[]).includes(base ?? "")
    ? (base as AgentHomeLanguage)
    : "fr";
}

export function normalizeProfile(input: AgentHomeProfileInput): AgentHomeProfile {
  if (!isAgentHomeId(input.agentId)) throw new Error(`invalid agent home id: ${input.agentId}`);
  return {
    agentId: input.agentId,
    name: clean(input.name, AGENT_HOME_LIMITS.name),
    language: homeLanguage(input.language),
    timezone: validTimezone(clean(input.timezone, 64)),
    preferences: [
      ...new Set(
        (input.preferences ?? [])
          .map((p) => clean(p, AGENT_HOME_LIMITS.preference))
          .filter((p): p is string => p !== null),
      ),
    ].slice(0, AGENT_HOME_LIMITS.preferences),
    avatarUrl: validAvatar(clean(input.avatarUrl, AGENT_HOME_LIMITS.avatar)),
  };
}

// ── Frontmatter (the subset `aphrody-agent-home`'s frontmatter.rs reads) ──────────────────

type FmValue = string | string[];

/** Split `---` frontmatter from the body; `null` when the document has none. */
export function splitFrontmatter(doc: string): { fm: string | null; body: string } {
  const text = doc.replace(/^﻿/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? { fm: match[1]!, body: text.slice(match[0].length) } : { fm: null, body: doc };
}

const unquote = (s: string) =>
  s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))
    ? s.slice(1, -1)
    : s;

/** Ordered `key → scalar | list` pairs, as frontmatter.rs parses them. */
export function parseFrontmatterBlock(fm: string): Map<string, FmValue> {
  const out = new Map<string, FmValue>();
  const lines = fm.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!key) continue;
    if (!value) {
      const items: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const item = lines[j]!.trimStart();
        if (item.startsWith("- ")) items.push(unquote(item.slice(2).trim()));
        else if (item) break;
      }
      out.set(key, items.length ? items : "");
      if (items.length) i = j - 1;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      out.set(key, inner ? inner.split(",").map((s) => unquote(s.trim())) : []);
    } else {
      out.set(key, unquote(value));
    }
  }
  return out;
}

const scalar = (v: FmValue | undefined): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** The user's fields of a `USER.md` (aliases of `aphrody-agent-home`'s `UserProfile`). */
export function readUserProfile(userMd: string, agentId?: string): AgentHomeProfile {
  const { fm } = splitFrontmatter(userMd);
  const map = fm ? parseFrontmatterBlock(fm) : new Map<string, FmValue>();
  const prefs = map.get("preferences");
  return normalizeProfile({
    agentId: agentId ?? scalar(map.get("agent_id")) ?? LOCAL_AGENT_ID,
    name: scalar(map.get("address_as") ?? map.get("name") ?? map.get("call_me")),
    language: scalar(map.get("language") ?? map.get("lang")),
    timezone: scalar(map.get("timezone") ?? map.get("tz")),
    preferences: Array.isArray(prefs) ? prefs : prefs ? [prefs] : [],
    avatarUrl: scalar(map.get("avatar")),
  });
}

/** `updated_at` written in a `USER.md`, if any. */
export function readUpdatedAt(userMd: string): string | null {
  const { fm } = splitFrontmatter(userMd);
  return fm ? scalar(parseFrontmatterBlock(fm).get("updated_at")) : null;
}

/** Rewrite the given keys of a document's frontmatter (others and the body kept). */
export function setFrontmatter(doc: string, values: Record<string, FmValue>): string {
  const { fm, body } = splitFrontmatter(doc);
  const lines = fm ? fm.split(/\r?\n/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  const render = (key: string, value: FmValue): string[] =>
    Array.isArray(value)
      ? value.length
        ? [`${key}:`, ...value.map((item) => `  - "${item}"`)]
        : [`${key}: []`]
      : [`${key}: "${value}"`];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const key = /^([A-Za-z0-9_-]+)\s*:/.exec(line)?.[1];
    if (key && key in values) {
      seen.add(key);
      out.push(...render(key, values[key]!));
      // Drop the block-list items of the old value.
      while (i + 1 < lines.length && /^\s+- /.test(lines[i + 1]!)) i++;
    } else out.push(line);
  }
  for (const [key, value] of Object.entries(values))
    if (!seen.has(key)) out.push(...render(key, value));
  return `---\n${out.join("\n")}\n---\n\n${body.replace(/^\s+/, "")}`;
}

// ── Instantiation and convergence ────────────────────────────────────────────────────────

function userFields(
  profile: AgentHomeProfile,
  updatedAt: string,
  templateRevision: string,
): Record<string, FmValue> {
  return {
    agent_id: profile.agentId,
    address_as: profile.name ?? "",
    language: profile.language,
    timezone: profile.timezone ?? "",
    avatar: profile.avatarUrl ?? "",
    preferences: profile.preferences,
    updated_at: updatedAt,
    template_revision: templateRevision,
  };
}

/** A new agent home from the template, personalised with the user's fields. */
export function instantiateAgentHome(
  template: AgentHomeTemplate,
  input: AgentHomeProfileInput,
  now: Date = new Date(),
): AgentHomeSnapshot {
  const profile = normalizeProfile(input);
  const at = now.toISOString();
  return {
    agentId: profile.agentId,
    profile,
    files: {
      ...template.files,
      "USER.md": setFrontmatter(
        template.files["USER.md"],
        userFields(profile, at, template.revision),
      ),
    },
    templateRevision: template.revision,
    createdAt: at,
    updatedAt: at,
  };
}

/**
 * Change the user's fields of a home (given keys only); `agentId` re-keys it, which is how
 * the anonymous `local` home becomes `discord:<user_id>` at sign-in.
 */
export function updateAgentHome(
  home: AgentHomeSnapshot,
  patch: Partial<AgentHomeProfileInput>,
  now: Date = new Date(),
): AgentHomeSnapshot {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const profile = normalizeProfile({ ...home.profile, ...defined });
  const at = now.toISOString();
  return {
    ...home,
    agentId: profile.agentId,
    profile,
    files: {
      ...home.files,
      "USER.md": setFrontmatter(
        home.files["USER.md"],
        userFields(profile, at, home.templateRevision),
      ),
    },
    updatedAt: at,
  };
}

/**
 * Convert the anonymous `local` home into the signed-in user's home: the user's own edits of
 * `local` are kept, the Discord facts (id, avatar, and the name or language the user never
 * set) are added. When the user already has a `discord:` home elsewhere, the stores converge
 * on the newer one ({@link newerHome}).
 */
export function convertLocalHome(
  local: AgentHomeSnapshot,
  discord: Omit<AgentHomeProfileInput, "agentId"> & { discordId: string },
  now: Date = new Date(),
): AgentHomeSnapshot {
  const agentId = agentHomeId(discord.discordId);
  if (agentId === LOCAL_AGENT_ID) throw new Error("invalid Discord id");
  return updateAgentHome(
    local,
    {
      agentId,
      name: local.profile.name ?? discord.name ?? null,
      avatarUrl: discord.avatarUrl ?? local.profile.avatarUrl,
      timezone: local.profile.timezone ?? discord.timezone ?? null,
      ...(discord.language && local.profile.language === "fr"
        ? { language: discord.language }
        : {}),
    },
    now,
  );
}

/** Last-writer-wins on `updatedAt`, ties broken by content (the conversation store's rule). */
export function newerHome(incoming: AgentHomeSnapshot, current: AgentHomeSnapshot): boolean {
  if (incoming.updatedAt !== current.updatedAt) return incoming.updatedAt > current.updatedAt;
  return JSON.stringify(incoming.files) > JSON.stringify(current.files);
}

/** Check a snapshot before a store writes it (ids, the seven documents, sizes). */
export function checkAgentHome(home: AgentHomeSnapshot): void {
  if (!isAgentHomeId(home.agentId)) throw new Error(`invalid agent home id: ${home.agentId}`);
  if (home.profile.agentId !== home.agentId) throw new Error("profile and home ids differ");
  for (const name of AGENT_HOME_DOCUMENTS) {
    const text = home.files[name];
    if (typeof text !== "string" || !text.trim()) throw new Error(`missing document: ${name}`);
    if (new TextEncoder().encode(text).byteLength > AGENT_HOME_LIMITS.documentBytes)
      throw new Error(`document too large: ${name}`);
  }
  for (const at of [home.createdAt, home.updatedAt])
    if (Number.isNaN(Date.parse(at))) throw new Error(`invalid timestamp: ${at}`);
}

// ── Desktop sign-in (loopback redirect, RFC 8252) ─────────────────────────────────────────

/**
 * Sign-in of Shenron Studio with Discord: the local server opens the system browser on the
 * site's `sitePath?state=&port=`; the site signs the user in (Better Auth, Discord OAuth),
 * then redirects to `http://127.0.0.1:<port><callbackPath>?state=&code=` with a short-lived
 * signed code; the local server checks `state` and trades the code at `verifyPath` for the
 * Discord identity, which converts the `local` home.
 */
export const DESKTOP_LINK = {
  sitePath: "/api/desktop/link",
  verifyPath: "/api/desktop/link/verify",
  callbackPath: "/api/local/agent-home/callback",
  ttlMs: 120_000,
  state: /^[A-Za-z0-9_-]{22,128}$/,
} as const;

/** Identity the site vouches for at `verifyPath`. */
export interface DesktopLinkIdentity {
  discordId: string;
  name: string | null;
  avatarUrl: string | null;
  language: AgentHomeLanguage;
}

/** Loopback port of a link request (unprivileged only). */
export function desktopLinkPort(value: string | null | undefined): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
}

export function desktopCallbackUrl(port: number, state: string, code: string): string {
  const url = new URL(`http://127.0.0.1:${port}${DESKTOP_LINK.callbackPath}`);
  url.searchParams.set("state", state);
  url.searchParams.set("code", code);
  return url.toString();
}
