import { hostAuthUrl, sessionAuth } from "@/lib/host-auth";
import { hostCurrentUser } from "@/lib/host-current-user";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { staffPolicyFromEnv, type StaffPolicy } from "@aphrody/shenron-auth/staff";
import { requestHeaders } from "@aphrody/shenron-auth/next";
import { readCookie } from "@aphrody/shenron-auth/guards";
import { parseBearer } from "@aphrody/shenron-auth/crypto";
import { createDiscordAccountLookup } from "@aphrody/shenron-db/repos/accounts";
import { env } from "@/lib/env";
import {
  ADMIN_COOKIE,
  adminTokenEnabled,
  verifyAdminCookie,
  verifyAdminTokenOrBearer,
} from "@/lib/admin-token";
import { isAdminIp } from "@/lib/admin-ip";
import {
  cacheCurrentUser,
  readCachedCurrentUser,
  type CurrentUser,
  type SiteUser,
} from "@/lib/current-user-cache";

export type { CurrentUser, SiteUser } from "@/lib/current-user-cache";

/**
 * Pipeline auth admin — source unique de vérité.
 *
 * 1. Discord OAuth (Better Auth) → ba_user / ba_account / ba_session (Postgres).
 * 2. With a Bun host, getCurrentUser() reads its synchronized business profile
 *    without a local DB join or cache. Local mode reads ba_account via
 *    `createDiscordAccountLookup` pour récupérer le Discord ID, puis upsert le
 *    user métier (`users`) en resynchronisant username/avatar et en calculant roleAdmin.
 * 3. requireAdmin() / isCurrentUserAdmin() gatent /admin/* et le proxy bot-admin.
 *
 * roleAdmin = politique staff du site (`staffPolicyFromEnv(env, "site")` :
 * OWNER_ID ∪ OAUTH_ALLOWED_USERS). Déterminé à chaque requête (pas seulement à
 * la création) → robuste aux changements d'env.
 */

/** Source d'env de la politique staff du site (valeurs déjà validées par `env`). */
function siteStaffPolicy(): StaffPolicy {
  return staffPolicyFromEnv(
    { OWNER_ID: env.OWNER_ID, OAUTH_ALLOWED_USERS: env.OAUTH_ALLOWED_USERS.join(",") },
    "site",
  );
}

function resolveRoleAdmin(discordId: string): boolean {
  return siteStaffPolicy().isStaff(discordId);
}

/** `sessionUserId` d'une requête authentifiée par jeton plutôt que par Discord. */
export const TOKEN_ADMIN_SESSION_ID = "token-admin";

/**
 * Identité d'écriture d'une requête authentifiée par jeton, telle que
 * `wiki_revisions` la fige (`editorId`, `editorName`, texte libre sans clé
 * étrangère). Ce n'est pas un humain : la requête est rattachée au compte
 * `OWNER_ID` pour les écritures qui exigent une ligne `users`, mais le journal
 * doit pouvoir distinguer une automatisation du propriétaire.
 */
export interface AutomationActor {
  readonly id: string;
  readonly name: string;
}

/** `Authorization: Bearer` ou `x-admin-token` avec le jeton d'administration. */
export const API_TOKEN_ACTOR: AutomationActor = Object.freeze({
  id: "api-token",
  name: "Jeton API (automatisation)",
});

/** Cookie signé `dbfr_admin` posé par `/admin-access` : le jeton saisi dans un navigateur. */
export const ADMIN_COOKIE_ACTOR: AutomationActor = Object.freeze({
  id: "admin-token-cookie",
  name: "Jeton admin (session navigateur)",
});

/** Requête venue d'une adresse de `SHENRON_ADMIN_IPS`, sans session ni jeton. */
export const ADMIN_IP_ACTOR: AutomationActor = Object.freeze({
  id: "admin-ip",
  name: "Poste d'administration (adresse IP)",
});

/** Clé d'agent `dbfr_agent_…` : chaque clé garde sa propre identité. */
export function agentKeyActor(agent: { keyId: string; name: string }): AutomationActor {
  return { id: `agent-key:${agent.keyId}`, name: `${agent.name.trim() || "Agent"} (clé d'agent)` };
}

/** Utilisateur courant, avec l'identité d'automatisation quand la requête vient d'un jeton. */
export type SessionUser = CurrentUser & { automation?: AutomationActor };

/** Auteur d'une révision (`wiki_revisions.editorId` / `editorName`). */
export type RevisionAuthor = { id: string | null; name: string | null } | null;

/**
 * Auteur à figer dans `wiki_revisions` pour l'utilisateur courant : l'identité
 * d'automatisation pour une requête par jeton, jamais le compte `OWNER_ID` sur
 * lequel elle est rattachée ; sinon le user métier.
 */
export function revisionActorOf(me: SessionUser | null | undefined): RevisionAuthor {
  if (!me) return null;
  if (me.automation) return { id: me.automation.id, name: me.automation.name };
  if (me.sessionUserId === TOKEN_ADMIN_SESSION_ID) return { ...API_TOKEN_ACTOR };
  if (!me.user) return null;
  return { id: me.user.id ?? null, name: me.user.username ?? null };
}

function withAutomation(value: CurrentUser, automation: AutomationActor): SessionUser {
  return { ...value, automation };
}

// Mémoïsation in-process de la jointure ba_account→users, par sessionUserId.
// Évite un aller-retour Neon (us-east-1) sur chaque requête depuis cdg1 : sur une
// instance chaude (Fluid Compute), la 2e+ résolution est servie depuis la RAM.
// TTL court → un changement de roleAdmin/username se propage en ≤ 60 s.
// Cache de la résolution token-admin (la valeur ne change jamais) → évite un
// aller-retour Neon à chaque requête, vu que la console admin poll toutes les 5 s.
let tokenAdminCache: { at: number; value: CurrentUser } | null = null;
const TOKEN_ADMIN_TTL = 60_000;
let warnedNoOwner = false;

/**
 * Résout l'admin par token (cookie signé valide). Mappe sur le user métier de
 * l'OWNER si `OWNER_ID` est connu (lecture d'abord, écriture seulement si la
 * ligne manque ou n'est pas encore admin) ; sinon renvoie un admin synthétique.
 * Mémoïsé 60 s. Cf. `@/lib/admin-token`.
 */
async function resolveTokenAdmin(): Promise<CurrentUser> {
  if (tokenAdminCache && Date.now() - tokenAdminCache.at < TOKEN_ADMIN_TTL) {
    return tokenAdminCache.value;
  }
  const ownerId = env.OWNER_ID;
  let value: CurrentUser;
  if (ownerId) {
    const { db } = await import("@/lib/db");
    const [existing] = await db.select().from(users).where(eq(users.discordId, ownerId)).limit(1);
    let row = existing;
    // N'écrit QUE si nécessaire (ligne absente ou pas encore admin).
    if (!row || !row.roleAdmin) {
      const inserted = await db
        .insert(users)
        .values({
          discordId: ownerId,
          username: row?.username ?? "Admin (token)",
          avatar: row?.avatar ?? null,
          roleAdmin: true,
        })
        .onConflictDoUpdate({ target: users.discordId, set: { roleAdmin: true } })
        .returning();
      row = inserted[0] ?? row;
    }
    value = { sessionUserId: TOKEN_ADMIN_SESSION_ID, discordId: ownerId, user: row ?? null };
  } else {
    // Mode dégradé : sans OWNER_ID, pas de ligne `users` → les écritures
    // user-keyed (createTierlist/posts) échoueraient en FK. On garde l'accès
    // admin (lecture + proxy bot-admin) mais on avertit de configurer OWNER_ID.
    if (!warnedNoOwner) {
      console.warn("[auth] admin par token sans OWNER_ID : écritures user-keyed indisponibles.");
      warnedNoOwner = true;
    }
    const synthetic: SiteUser = {
      id: TOKEN_ADMIN_SESSION_ID,
      discordId: "",
      username: "Admin (token)",
      avatar: null,
      roleAdmin: true,
      createdAt: new Date(),
    };
    value = { sessionUserId: TOKEN_ADMIN_SESSION_ID, discordId: "", user: synthetic };
  }
  tokenAdminCache = { at: Date.now(), value };
  return value;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  // Admin par token / cookie signé / Bearer (sans Discord). Prioritaire et
  // no-op si la fonctionnalité est désactivée (SHENRON_ADMIN_TOKEN absent).
  const reqHeaders = await requestHeaders();
  if (adminTokenEnabled()) {
    // 1. Cookie signé httpOnly
    if (verifyAdminCookie(readCookie(reqHeaders, ADMIN_COOKIE))) {
      return withAutomation(await resolveTokenAdmin(), ADMIN_COOKIE_ACTOR);
    }

    // 2. En-tête explicite x-admin-token
    const xAdminToken = reqHeaders.get("x-admin-token");
    if (xAdminToken && verifyAdminTokenOrBearer(xAdminToken)) {
      return withAutomation(await resolveTokenAdmin(), API_TOKEN_ACTOR);
    }

    // 3. En-tête Authorization: Bearer
    const bearer = parseBearer(reqHeaders);
    if (bearer) {
      if (verifyAdminTokenOrBearer(bearer)) {
        return withAutomation(await resolveTokenAdmin(), API_TOKEN_ACTOR);
      }
      if (bearer.startsWith("dbfr_agent_")) {
        const { authenticateAgent } = await import("@/lib/agent-keys");
        const req = new Request("https://dragonballfr.com", { headers: reqHeaders });
        const agent = await authenticateAgent(req).catch(() => null);
        if (
          agent &&
          (agent.scopes.includes("moderate") ||
            agent.scopes.includes("publish:articles") ||
            agent.scopes.includes("write:articles"))
        ) {
          return withAutomation(await resolveTokenAdmin(), agentKeyActor(agent));
        }
      }
    }
  }

  const host = hostAuthUrl();
  if (host) {
    const reader = await hostCurrentUser(host, reqHeaders);
    if (reader) return reader;
    return isAdminIp(reqHeaders) ? withAutomation(await resolveTokenAdmin(), ADMIN_IP_ACTOR) : null;
  }

  const session = await sessionAuth.api.getSession({ headers: reqHeaders });
  if (!session?.user) {
    // Poste d'administration (`SHENRON_ADMIN_IPS`) sans session : l'admin par jeton,
    // tracé sous sa propre identité d'automatisation.
    return isAdminIp(reqHeaders) ? withAutomation(await resolveTokenAdmin(), ADMIN_IP_ACTOR) : null;
  }

  const cached = readCachedCurrentUser(session.user.id);
  if (cached) return cached;

  const { db } = await import("@/lib/db");
  const discordAccounts = createDiscordAccountLookup(db);
  // Compte Discord lié → fournit le Discord ID (= clé du user métier).
  const discordId = await discordAccounts.discordIdForUser(session.user.id);

  // Session valide mais compte pas encore lié (race au tout premier login) :
  // on renvoie la session sans user métier ; ça se résout au call suivant.
  if (!discordId) {
    return { sessionUserId: session.user.id, discordId: "", user: null };
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.discordId, discordId))
    .limit(1);

  const shouldBeAdmin = resolveRoleAdmin(discordId);
  const wantUsername = session.user.name ?? "Saiyan";
  const wantAvatar = session.user.image ?? null;

  // Upsert/resync : crée le user métier au 1er passage, et garde
  // username/avatar/roleAdmin alignés ensuite (resync si divergence).
  let appUser: SiteUser | null = existingUser ?? null;
  const needsSync =
    !appUser ||
    appUser.username !== wantUsername ||
    appUser.avatar !== wantAvatar ||
    (shouldBeAdmin && !appUser.roleAdmin);

  if (needsSync) {
    const wasAdmin = appUser?.roleAdmin === true;
    const inserted = await db
      .insert(users)
      .values({
        discordId,
        username: wantUsername,
        avatar: wantAvatar,
        roleAdmin: shouldBeAdmin,
      })
      .onConflictDoUpdate({
        target: users.discordId,
        set: {
          username: wantUsername,
          avatar: wantAvatar,
          // On n'élève jamais à false ici (révocation = manuelle) ; on
          // élève à true si l'env le dit.
          ...(shouldBeAdmin ? { roleAdmin: true } : {}),
        },
      })
      .returning();
    appUser = inserted[0] ?? appUser;
    if (shouldBeAdmin && !wasAdmin) {
      console.info(`[auth] admin élevé : discordId=${discordId}`);
    }
  }

  const result: CurrentUser = {
    sessionUserId: session.user.id,
    discordId,
    user: appUser,
  };
  cacheCurrentUser(session.user.id, result);
  return result;
}

/**
 * The signed-in READER: a real Better Auth session (Discord sign-in), never an automation
 * actor. Admin access by IP (`SHENRON_ADMIN_IPS`), signed cookie, token or agent key is
 * attached to the `OWNER_ID` account for the admin guards and the API; shown in the public
 * UI, it made an anonymous visitor from an admin address appear signed in as that account.
 * Everything a reader sees about « their » account (`/api/me`, the shell account block,
 * member pages, profile ownership, favorites, ratings, reactions) goes through this one.
 */
export async function getSessionUser(): Promise<CurrentUser | null> {
  const me = await getCurrentUser();
  if (!me || (me as SessionUser).automation || me.sessionUserId === TOKEN_ADMIN_SESSION_ID)
    return null;
  return me;
}

/** Member pages: a real session, otherwise the sign-in page. */
export async function requireUser(callbackURL?: string): Promise<CurrentUser> {
  const me = await getSessionUser();
  if (!me) {
    const cb = callbackURL ? `?callbackURL=${encodeURIComponent(callbackURL)}` : "";
    redirect(`/signin${cb}`);
  }
  return me;
}

export async function requireAdmin(): Promise<CurrentUser & { user: SiteUser }> {
  // Admin guard: automation actors (IP, cookie, token) are valid here, unlike `requireUser`.
  const me = await getCurrentUser();
  if (!me) redirect("/signin?callbackURL=%2Fadmin");
  if (!me.user?.roleAdmin) redirect("/");
  return me as CurrentUser & { user: SiteUser };
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const me = await getCurrentUser();
  return me?.user?.roleAdmin === true;
}
