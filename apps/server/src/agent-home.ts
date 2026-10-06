// SPDX-License-Identifier: Apache-2.0
/**
 * The agent homes of `shenron-server` on a user's machine (Shenron Studio, local profile): the
 * single resolution point of the active agent home of the chat.
 *
 *   `<SHENRON_HOME>/agents/<id>/`  one home per user in the native `aphrody-agent-home` layout
 *                                  (`@shenron/db/agent-homes` DirAgentHomeStore), instantiated
 *                                  from the embedded public template `templates/agent-home`
 *   `<SHENRON_HOME>/agents/active.json`  `{ agentId }` of the active home
 *   `<home>/.aphrody/memory.sqlite`      the persistent chat memory of that home
 *
 * First start: an anonymous `local` home (language and timezone of the system). Discord
 * sign-in (`POST /api/local/agent-home/login`, system browser, loopback callback
 * `/api/local/agent-home/callback`, identity checked by the site) converts it into
 * `discord:<user_id>`: the directory moves with its memory, and `SHENRON_LOCAL_OWNER` follows so
 * the conversations, the memory and the persona of the chat all use the new id. Not used in
 * production, where the homes of Discord users live in the cloud (`chat.agent_homes`).
 *
 * Routes (loopback peers only; mutations refuse a foreign `Origin`):
 *   GET   /api/local/agent-home            the active home (id, profile, linked)
 *   PATCH /api/local/agent-home            `{ name?, language?, timezone?, preferences? }`
 *   POST  /api/local/agent-home/login      `{ open?: boolean }` → `{ url }` (opens the browser)
 *   GET   /api/local/agent-home/callback   `?state=&code=` → 302 `/desktop?agentHome=…`
 *   POST  /api/local/agent-home/logout     forget the site session (the home and memory stay)
 *
 * Persistent session: the `sessionToken` the site's verify step may return is kept in
 * `<SHENRON_HOME>/config/session` (mode 600). At start the cached identity shows at once
 * (`session: "cached"`), then `GET <auth>/api/auth/get-session` (Bearer; `<auth>` = `SHENRON_HOST_URL`, else the public site) validates it in the
 * background: 401 → `signedOut`, without opening the browser; a network error keeps `cached`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDirectLoopback } from "@shenron/config/net";
import { resolveAuthUrl, resolveSiteUrl } from "@shenron/config/public-urls";
import {
  type AgentHomeSnapshot,
  type AgentHomeTemplate,
  convertToDiscordHome,
  DESKTOP_LINK,
  type DesktopLinkIdentity,
  DirAgentHomeStore,
  discordIdOf,
  homeLanguage,
  instantiateAgentHome,
  isAgentHomeId,
  LOCAL_AGENT_ID,
  SHENRON_AGENT_TEMPLATE,
  updateAgentHome,
} from "@shenron/db/agent-homes";

import type { ServerPaths } from "./config";

export const AGENTS_DIR = "agents";
const ACTIVE_FILE = "active.json";
const MEMORY_FILE = "memory.sqlite";
const SESSION_FILE = join("config", "session");
const SESSION_PATH = "/api/auth/get-session";

/**
 * Site session of the desktop: `none` (never stored; a home linked before session tokens
 * counts as signed in), `cached` (stored, not checked yet), `valid`, `signedOut`.
 */
export type DesktopSessionState = "none" | "cached" | "valid" | "signedOut";

interface StoredSession {
  token: string | null;
  agentId: string | null;
  signedOut?: boolean;
  savedAt: string;
}

/** Sign-ins pending their callback (state → expiry). */
const PENDING_TTL_MS = 10 * 60_000;

export interface AgentHomesOptions {
  template?: AgentHomeTemplate;
  fetch?: typeof fetch;
  /** Open a URL in the system browser (default: the platform opener). */
  openBrowser?: (url: string) => void;
  /** System locale and timezone of a new `local` home (default: `Intl`). */
  system?: { locale?: string; timeZone?: string };
  now?: () => Date;
}

export interface AgentHomes {
  root: string;
  store: DirAgentHomeStore;
  /** Id of the active home (`discord:<user_id>` once signed in, else `local`). */
  activeId(): string;
  active(): AgentHomeSnapshot;
  /** Directory of an owner's existing home, `null` when it has none here. */
  dirOf(ownerId: string): string | null;
  /** SQLite memory file of a home (`MemoryLocation` of the API host). */
  memoryLocation(agentId: string): string;
  /** Earlier ids of a home whose memories sit in its file (`local` before sign-in). */
  memoryAliases(agentId: string): readonly string[];
  /** `/api/local/agent-home*`; `null` for any other path. */
  handle(request: Request, url: URL, peer: string | null | undefined): Promise<Response | null>;
  /** Complete a sign-in with an identity the site vouched for (the callback's last step). */
  link(identity: DesktopLinkIdentity): Promise<AgentHomeSnapshot>;
  /** State of the site session; `validated` settles once the start-up check is done. */
  session(): DesktopSessionState;
  validated: Promise<void>;
}

/** The platform opener of the system browser (no shell: the URL is one argument). */
export function systemOpener(url: string): void {
  const command =
    process.platform === "win32"
      ? ["rundll32", "url.dll,FileProtocolHandler", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];
  Bun.spawn(command, { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Open the agent homes of this machine and make sure the active one exists (the anonymous
 * `local` home on first start). Synchronous: the backend plan needs the active id.
 */
export function openAgentHomes(
  paths: Pick<ServerPaths, "home">,
  env: Record<string, string | undefined>,
  o: AgentHomesOptions = {},
): AgentHomes {
  const root = join(paths.home, AGENTS_DIR);
  mkdirSync(root, { recursive: true });
  const store = new DirAgentHomeStore(root);
  const template = o.template ?? SHENRON_AGENT_TEMPLATE;
  const now = o.now ?? (() => new Date());
  const doFetch = o.fetch ?? fetch;
  const open = o.openBrowser ?? systemOpener;
  const pending = new Map<string, number>();
  const activePath = join(root, ACTIVE_FILE);

  const readActive = (): string => {
    try {
      const { agentId } = JSON.parse(readFileSync(activePath, "utf8")) as { agentId?: string };
      if (agentId && isAgentHomeId(agentId) && store.readSync(agentId)) return agentId;
    } catch {
      // first start, or an unreadable pointer: back to the local home
    }
    return LOCAL_AGENT_ID;
  };
  const setActive = (agentId: string) => {
    writeJsonAtomic(activePath, { agentId, updatedAt: now().toISOString() });
    // The API host reads the loopback owner on each request: chat, memory and
    // conversations switch to the new id at once.
    env.SHENRON_LOCAL_OWNER = agentId;
  };

  let activeId = readActive();
  if (!store.readSync(activeId)) {
    const system = o.system ?? Intl.DateTimeFormat().resolvedOptions();
    store.writeSync(
      instantiateAgentHome(
        template,
        {
          agentId: LOCAL_AGENT_ID,
          language: homeLanguage(system.locale),
          timezone: system.timeZone ?? null,
        },
        now(),
      ),
    );
    activeId = LOCAL_AGENT_ID;
  }
  if (!existsSync(activePath) || readActive() !== activeId) setActive(activeId);
  else env.SHENRON_LOCAL_OWNER = activeId;

  const sessionPath = join(paths.home, SESSION_FILE);
  const readSession = (): StoredSession | null => {
    try {
      const value = JSON.parse(readFileSync(sessionPath, "utf8")) as StoredSession;
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  };
  const writeSession = (value: StoredSession) => {
    mkdirSync(join(paths.home, "config"), { recursive: true });
    writeJsonAtomic(sessionPath, value);
  };
  const stored = readSession();
  let sessionState: DesktopSessionState = stored?.signedOut
    ? "signedOut"
    : stored?.token
      ? "cached"
      : "none";
  const signOut = () => {
    sessionState = "signedOut";
    writeSession({ token: null, agentId: activeId, signedOut: true, savedAt: now().toISOString() });
  };
  // Background check of the cached token: never blocks the start, never opens the browser.
  const validated: Promise<void> =
    sessionState === "cached" && stored?.token
      ? (async () => {
          try {
            const response = await doFetch(new URL(SESSION_PATH, resolveAuthUrl(env)), {
              headers: { authorization: `Bearer ${stored.token}` },
              signal: AbortSignal.timeout(15_000),
            });
            if (response.status === 401 || response.status === 403) signOut();
            else if (response.ok) {
              const body = (await response.json().catch(() => null)) as unknown;
              if (body === null) signOut();
              else sessionState = "valid";
            }
          } catch {
            // offline: the cached identity stays
          }
        })()
      : Promise.resolve();

  async function link(identity: DesktopLinkIdentity): Promise<AgentHomeSnapshot> {
    const target = `discord:${identity.discordId}`;
    if (!isAgentHomeId(target)) throw new Error("invalid Discord id");
    // The local directory moves whole (memory, skills, state) unless the user already has a
    // Discord home on this machine; then the newer snapshot wins and `local` stays aside.
    if (!store.readSync(target) && store.readSync(LOCAL_AGENT_ID))
      store.moveSync(LOCAL_AGENT_ID, target);
    const home = await convertToDiscordHome(store, template, identity, now());
    activeId = home.agentId;
    setActive(activeId);
    return home;
  }

  const view = (home: AgentHomeSnapshot) => ({
    agentId: home.agentId,
    linked: discordIdOf(home.agentId) !== null,
    session: sessionState,
    signedIn: discordIdOf(home.agentId) !== null && sessionState !== "signedOut",
    profile: home.profile,
    templateRevision: home.templateRevision,
    createdAt: home.createdAt,
    updatedAt: home.updatedAt,
  });

  const foreignOrigin = (request: Request, url: URL) => {
    const origin = request.headers.get("origin");
    return Boolean(origin) && origin !== url.origin && origin !== "tauri://localhost";
  };

  return {
    root,
    store,
    activeId: () => activeId,
    active: () => store.readSync(activeId)!,
    dirOf(ownerId) {
      if (!isAgentHomeId(ownerId)) return null;
      const dir = store.dirOf(ownerId);
      return existsSync(join(dir, "SOUL.md")) ? dir : null;
    },
    memoryLocation: (agentId) =>
      join(
        isAgentHomeId(agentId) ? store.dirOf(agentId) : store.dirOf(LOCAL_AGENT_ID),
        ".aphrody",
        MEMORY_FILE,
      ),
    memoryAliases: (agentId) => (agentId.startsWith("discord:") ? [LOCAL_AGENT_ID] : []),
    link,
    session: () => sessionState,
    validated,
    async handle(request, url, peer) {
      if (
        url.pathname !== "/api/local/agent-home" &&
        !url.pathname.startsWith("/api/local/agent-home/")
      )
        return null;
      if (!isDirectLoopback(request.headers, peer)) return json({ error: "loopback_only" }, 403);
      const route = url.pathname.slice("/api/local/agent-home".length) || "/";
      if (route === "/" && request.method === "GET") return json(view(store.readSync(activeId)!));
      if (route === "/" && request.method === "PATCH") {
        if (foreignOrigin(request, url)) return json({ error: "forbidden_origin" }, 403);
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
        const patch: Record<string, unknown> = {};
        for (const key of ["name", "language", "timezone"] as const)
          if (typeof body[key] === "string" || body[key] === null) patch[key] = body[key];
        if (Array.isArray(body.preferences))
          patch.preferences = body.preferences.filter((p): p is string => typeof p === "string");
        const home = updateAgentHome(store.readSync(activeId)!, patch, now());
        store.writeSync(home);
        return json(view(home));
      }
      if (route === "/logout" && request.method === "POST") {
        if (foreignOrigin(request, url)) return json({ error: "forbidden_origin" }, 403);
        signOut();
        return json(view(store.readSync(activeId)!));
      }
      if (route === "/login" && request.method === "POST") {
        if (foreignOrigin(request, url)) return json({ error: "forbidden_origin" }, 403);
        const body = (await request.json().catch(() => ({}))) as { open?: unknown };
        const state = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
        const at = Date.now();
        for (const [key, expiry] of pending) if (expiry <= at) pending.delete(key);
        pending.set(state, at + PENDING_TTL_MS);
        const port = url.port || (url.protocol === "https:" ? "443" : "80");
        const target = new URL(DESKTOP_LINK.sitePath, resolveSiteUrl(env));
        target.searchParams.set("state", state);
        target.searchParams.set("port", port);
        if (body.open !== false) open(target.toString());
        return json({ url: target.toString() });
      }
      if (route === "/callback" && request.method === "GET") {
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const expiry = pending.get(state);
        pending.delete(state);
        const back = (status: string) =>
          Response.redirect(new URL(`/desktop?agentHome=${status}`, url.origin).toString(), 302);
        if (!expiry || expiry <= Date.now() || !code) return back("expired");
        try {
          const response = await doFetch(new URL(DESKTOP_LINK.verifyPath, resolveSiteUrl(env)), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code, state }),
            signal: AbortSignal.timeout(15_000),
          });
          if (!response.ok) return back("refused");
          const verified = (await response.json()) as DesktopLinkIdentity & {
            sessionToken?: unknown;
          };
          const home = await link(verified);
          // `sessionToken` comes with the site's persistent desktop session; older sites omit it.
          const token =
            typeof verified.sessionToken === "string" && verified.sessionToken
              ? verified.sessionToken
              : null;
          writeSession({ token, agentId: home.agentId, savedAt: now().toISOString() });
          sessionState = token ? "valid" : "none";
          return back("linked");
        } catch (error) {
          console.error(
            JSON.stringify({ event: "shenron.agent_home.link_failed", error: String(error) }),
          );
          return back("failed");
        }
      }
      return json({ error: "not_found" }, 404);
    },
  };
}
