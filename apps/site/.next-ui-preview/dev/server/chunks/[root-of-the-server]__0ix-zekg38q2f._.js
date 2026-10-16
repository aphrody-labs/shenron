module.exports = [
(()=>{"use strict";return[
"[project]/apps/site/src/db/schema.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

/** Shim : le schéma vit dans `@aphrody/shenron-db` (paquet partagé site/bot/API). */ __turbopack_context__.s([]);
;
}),
"[project]/apps/site/src/lib/admin-ip.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "adminIpRanges",
    ()=>adminIpRanges,
    "isAdminIp",
    ()=>isAdminIp
]);
/**
 * Administration par adresse IP : les postes et serveurs de l'opérateur listés dans
 * `SHENRON_ADMIN_IPS` (adresses ou CIDR) sont staff sans session ni jeton — pages
 * `/admin`, routes « admin ou jeton », écritures (desktop, CLI et scripts compris).
 *
 * L'adresse est celle que nginx écrit dans `X-Real-IP` (`$remote_addr`, jamais celle du
 * client) ; à défaut, la dernière entrée de `X-Forwarded-For`, ajoutée par le proxy
 * (`clientIpFromHeaders`). Une entrée invalide de la liste est ignorée, jamais élargie.
 * Liste vide ou absente : aucun accès par IP. Lue par `@aphrody/shenron-config/env` comme les jetons
 * de `@/lib/api-token` : ce module reste importable sans valider tout l'environnement du site.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$net$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/net.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/env.ts [middleware] (ecmascript)");
;
;
let cache = null;
function adminIpRanges(raw = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envString"])(process.env, "SHENRON_ADMIN_IPS")) {
    if (!cache || cache.raw !== raw) {
        const { ranges, invalid } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$net$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["parseIpAllowlist"])(raw);
        if (invalid.length) console.warn(`[admin-ip] entrées ignorées : ${invalid.join(", ")}`);
        cache = {
            raw,
            ranges
        };
    }
    return cache.ranges;
}
function isAdminIp(headers, ranges = adminIpRanges()) {
    if (ranges.length === 0) return false;
    const ip = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$net$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["clientIpFromHeaders"])(headers);
    return ip !== "unknown" && (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$net$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ipInRanges"])(ip, ranges);
}
}),
"[project]/apps/site/src/lib/admin-token.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ADMIN_COOKIE",
    ()=>ADMIN_COOKIE,
    "ADMIN_COOKIE_MAX_AGE",
    ()=>ADMIN_COOKIE_MAX_AGE,
    "DURABLE_ADMIN_COOKIE_MAX_AGE",
    ()=>DURABLE_ADMIN_COOKIE_MAX_AGE,
    "adminTokenEnabled",
    ()=>adminTokenEnabled,
    "buildAdminCookieValue",
    ()=>buildAdminCookieValue,
    "tokenMatches",
    ()=>tokenMatches,
    "verifyAdminCookie",
    ()=>verifyAdminCookie,
    "verifyAdminTokenOrBearer",
    ()=>verifyAdminTokenOrBearer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$tokens$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/tokens.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/crypto.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/env.ts [middleware] (ecmascript)");
;
;
;
;
const ADMIN_COOKIE = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$tokens$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ADMIN_COOKIE"];
let codecCache = null;
/** Codec construit sur les valeurs d'env courantes (reconstruit si elles changent). */ function codec() {
    const secret = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["env"].BETTER_AUTH_SECRET;
    const token = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["env"].SHENRON_ADMIN_TOKEN ?? "";
    if (!codecCache || codecCache.secret !== secret || codecCache.token !== token) {
        codecCache = {
            secret,
            token,
            codec: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$tokens$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["createAdminCookieCodec"])({
                secret,
                masterToken: token
            })
        };
    }
    return codecCache.codec;
}
const ADMIN_COOKIE_MAX_AGE = Math.floor(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$tokens$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ADMIN_COOKIE_TTL_MS"] / 1000);
function adminTokenEnabled() {
    return !!__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["env"].SHENRON_ADMIN_TOKEN;
}
function tokenMatches(input) {
    const t = __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["env"].SHENRON_ADMIN_TOKEN;
    if (!t || !input) return false;
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["timingSafeEqualString"])(input, t);
}
function buildAdminCookieValue() {
    return codec().sign();
}
const DURABLE_ADMIN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
function verifyAdminCookie(value) {
    if (!value || !adminTokenEnabled()) return false;
    return codec().verify(value);
}
function verifyAdminTokenOrBearer(value) {
    if (!value || !adminTokenEnabled()) return false;
    const trimmed = value.trim();
    if (tokenMatches(trimmed)) return true;
    return verifyAdminCookie(trimmed);
}
}),
"[project]/apps/site/src/lib/agent-keys.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

/**
 * agent-keys — jetons d'accès des agents à l'API d'écriture du site.
 *
 * Pourquoi une table plutôt qu'une variable d'environnement : le site doit
 * pouvoir être alimenté par plusieurs agents (ingest canon, traducteur
 * databooks, rédacteur assisté, MCP d'un tiers) avec des droits DIFFÉRENTS et
 * révocables un par un. `SHENRON_ADMIN_TOKEN` ouvre tout — Discord, économie,
 * synchronisation ; le donner à un agent rédactionnel serait disproportionné.
 *
 * Deux garanties :
 *
 *  1. **Le jeton en clair n'existe qu'une fois.** On ne stocke que son SHA-256.
 *     Un dump de la base ne permet pas d'écrire sur le site. L'admin qui crée
 *     la clé la voit une seule fois, à la création.
 *  2. **Les portées sont explicites.** Pas de « clé d'agent » générique :
 *     `read`, `contribute`, `comment`, `write:articles`, `publish:articles`,
 *     `moderate` sont demandées une par une. Une clé d'ingest qui fuite ne
 *     publie rien.
 *
 * Server-only.
 */ __turbopack_context__.s([
    "agentCallsLastHour",
    ()=>agentCallsLastHour,
    "authenticateAgent",
    ()=>authenticateAgent,
    "createAgentKey",
    ()=>createAgentKey,
    "listAgentAudit",
    ()=>listAgentAudit,
    "listAgentKeys",
    ()=>listAgentKeys,
    "recordAgentCall",
    ()=>recordAgentCall,
    "revokeAgentKey",
    ()=>revokeAgentKey,
    "updateAgentKeyScopes",
    ()=>updateAgentKeyScopes
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/agent-keys.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$guards$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/guards.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$repos$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/repos/agent-keys.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$db$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/lib/db.ts [middleware] (ecmascript) <locals>");
/** Quota d'écritures par heure quand la clé n'en fixe pas. */ // Le vocabulaire des portées et sa validation vivent dans `lib/agent-scopes.ts`
// (client-safe) : l'écran d'administration et la page de documentation publique
// en ont besoin hors serveur. Ré-exporté ici pour les appelants historiques.
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$agent$2d$scopes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/agent-scopes.ts [middleware] (ecmascript)");
;
;
;
;
;
;
/**
 * Stockage : `createAgentKeyRepository` (`@aphrody/shenron-db`) — seul le SHA-256 du
 * jeton est écrit, révocation logique (`revokedAt`), aucune ligne supprimée.
 * Format et hachage des jetons : `@aphrody/shenron-auth/agent-keys`.
 */ const repository = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$repos$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["createAgentKeyRepository"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$db$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"]);
function createAgentKey(input) {
    return repository.createAgentKey(input);
}
function listAgentKeys() {
    return repository.listAgentKeys();
}
function revokeAgentKey(id) {
    return repository.revokeAgentKey(id);
}
function updateAgentKeyScopes(id, scopes) {
    return repository.updateAgentKeyScopes(id, scopes);
}
async function authenticateAgent(req) {
    const decision = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$guards$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["authorize"])(req, [
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$guards$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["agentKeyStrategy"])({
            store: repository
        })
    ]);
    if (!decision.ok || decision.principal.kind !== "agent") return null;
    const principal = decision.principal;
    return {
        keyId: principal.keyId,
        name: principal.name ?? "",
        scopes: [
            ...principal.scopes
        ],
        rateLimitPerHour: principal.rateLimit ?? __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_AGENT_RATE_LIMIT"]
    };
}
function agentCallsLastHour(keyId) {
    return repository.agentCallsLastHour(keyId);
}
function recordAgentCall(entry) {
    return repository.recordAgentCall(entry);
}
function listAgentAudit(limit = 100) {
    return repository.listAgentAudit(limit);
}
}),
"[project]/apps/site/src/lib/agent-scopes.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SCOPE_DESCRIPTIONS",
    ()=>SCOPE_DESCRIPTIONS,
    "parseScopes",
    ()=>parseScopes
]);
/**
 * agent-scopes — le vocabulaire des portées d'agent, **client-safe**.
 *
 * Séparé de `lib/agent-keys.ts` (marqué `server-only`, il touche la base et le
 * hachage des jetons) parce que trois surfaces en ont besoin hors serveur :
 * l'écran d'administration qui coche les portées, la page de documentation
 * publique qui les explique, et les tests qui vérifient qu'une portée inventée
 * ne peut pas entrer en base.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/agent-keys.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$db$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/db/schema.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/constants.ts [middleware] (ecmascript)");
;
;
const SCOPE_DESCRIPTIONS = {
    read: "Lire le fil, les articles publiés et les discussions.",
    contribute: "Déposer une proposition de correction du wiki (file de modération).",
    "write:articles": "Créer des articles — en brouillon.",
    "publish:articles": "Mettre un article en ligne (ou le programmer).",
    comment: "Publier un message signé du nom de l'agent.",
    moderate: "Lire la file de modération, masquer ou épingler un message."
};
function parseScopes(input) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["parseScopes"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AGENT_SCOPES"], input) ?? [];
}
}),
"[project]/apps/site/src/lib/config.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "API_ORIGIN",
    ()=>API_ORIGIN,
    "API_URL",
    ()=>API_URL,
    "ASSET_BASE",
    ()=>ASSET_BASE,
    "ASSET_ORIGIN",
    ()=>ASSET_ORIGIN,
    "BOT_HOST",
    ()=>BOT_HOST,
    "CDN_ORIGIN",
    ()=>CDN_ORIGIN,
    "DISCORD_INVITE",
    ()=>DISCORD_INVITE,
    "SITE_HOST",
    ()=>SITE_HOST,
    "SITE_URL",
    ()=>SITE_URL,
    "STATIC_PREFIX",
    ()=>STATIC_PREFIX,
    "apiUrl",
    ()=>apiUrl,
    "botApiBaseUrl",
    ()=>botApiBaseUrl
]);
/**
 * config — **source unique** des URL/endpoints du site (client-safe).
 *
 * Avant : la base de l'API bot (`https://bot.dragonballfr.com`), l'invitation
 * Discord (`https://discord.gg/dbfr`) et l'URL du site étaient recopiées en dur
 * dans ~25 fichiers, chacun avec sa propre résolution `process.env.X ?? "…"`.
 * Une migration de domaine devait alors toucher 25 endroits. Désormais tout
 * passe par ce module — un seul `process.env` lu, une seule valeur par défaut.
 *
 * Universel (importable par RSC, route handlers ET Client Components) : on lit
 * `process.env` directement (pas `@/lib/env`, dont le proxy `@t3-oss` jette sur
 * accès à une var *server* depuis le client). Résolution **public d'abord** :
 *  - `NEXT_PUBLIC_*` est inliné dans le bundle client par Next, donc disponible
 *    partout ;
 *  - la var *server* (non publique) sert de repli côté serveur uniquement
 *    (vaut `undefined` côté client → on tombe sur la valeur par défaut).
 *
 * C'est la SEULE exception autorisée à la règle « pas de `process.env` hors
 * `env.ts` » : ce fichier EST la centralisation que cette règle vise.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/public-urls.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$services$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/services.ts [middleware] (ecmascript)");
;
;
/**
 * Accès littéraux (Next n'inline `NEXT_PUBLIC_*` que sous cette forme) ; la
 * précédence et les noms historiques vivent dans `@aphrody/shenron-config/public-urls`.
 */ const PUBLIC_ENV = {
    NEXT_PUBLIC_SITE_URL: ("TURBOPACK compile-time value", "http://127.0.0.1:3111"),
    NEXT_PUBLIC_SHENRON_API_URL: ("TURBOPACK compile-time value", "https://bot.dragonballfr.com"),
    NEXT_PUBLIC_SHENRON_ASSETS_URL: ("TURBOPACK compile-time value", "https://cdn.dragonballfr.com"),
    SHENRON_PUBLIC_SITE_URL: process.env.SHENRON_PUBLIC_SITE_URL,
    SHENRON_PUBLIC_API_URL: process.env.SHENRON_PUBLIC_API_URL,
    SHENRON_PUBLIC_ASSETS_URL: process.env.SHENRON_PUBLIC_ASSETS_URL,
    SHENRON_API_URL: process.env.SHENRON_API_URL,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL
};
const BOT_HOST = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_PUBLIC_ORIGINS"].api;
const SITE_HOST = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_PUBLIC_ORIGINS"].site;
const API_URL = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveApiUrl"])(PUBLIC_ENV);
const ASSET_BASE = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveAssetsUrl"])(PUBLIC_ENV);
const ASSET_ORIGIN = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["originOf"])(ASSET_BASE);
const API_ORIGIN = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["originOf"])(API_URL);
const STATIC_PREFIX = (("TURBOPACK compile-time value", "") ?? "").trim().replace(/\/+$/, "");
const CDN_ORIGIN = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_PUBLIC_ORIGINS"].cdn;
const SITE_URL = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveSiteUrl"])(PUBLIC_ENV);
const DISCORD_INVITE = ("TURBOPACK compile-time value", "") ?? __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_DISCORD_INVITE"];
function apiUrl(path = "") {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["joinUrl"])(API_URL, path);
}
function botApiBaseUrl(env = process.env) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$services$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveBotApiServerUrl"])(env);
}
}),
"[project]/apps/site/src/lib/db.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DB_APPLICATION_NAME",
    ()=>DB_APPLICATION_NAME,
    "closeDb",
    ()=>closeDb,
    "db",
    ()=>db
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$postgres$2d$js$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/postgres-js.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/schema.ts [middleware] (ecmascript)");
;
;
;
;
const DB_APPLICATION_NAME = "shenron-site";
const globalForDb = globalThis;
function getOrCreateDb() {
    if (!globalForDb.pgClient || !globalForDb.pgDb) {
        const created = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$postgres$2d$js$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["createDb"])({
            applicationName: DB_APPLICATION_NAME
        });
        globalForDb.pgClient = created.client;
        globalForDb.pgDb = created.db;
    }
    return {
        client: globalForDb.pgClient,
        db: globalForDb.pgDb
    };
}
const db = new Proxy({}, {
    get (_target, prop, receiver) {
        const actual = getOrCreateDb().db;
        const value = Reflect.get(actual, prop, receiver);
        return typeof value === "function" ? value.bind(actual) : value;
    }
});
;
async function closeDb(timeoutSeconds = 5) {
    if (!globalForDb.pgClient) return;
    const active = globalForDb.pgClient;
    globalForDb.pgClient = undefined;
    globalForDb.pgDb = undefined;
    await active.end({
        timeout: timeoutSeconds
    });
}
}),
"[project]/apps/site/src/lib/env.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "env",
    ()=>env
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$t3$2d$oss$2b$env$2d$nextjs$40$0$2e$13$2e$11$2b$0e2685038e47603a$2f$node_modules$2f40$t3$2d$oss$2f$env$2d$nextjs$2f$dist$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@t3-oss+env-nextjs@0.13.11+0e2685038e47603a/node_modules/@t3-oss/env-nextjs/dist/index.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/public-urls.ts [middleware] (ecmascript)");
;
;
;
const env = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$t3$2d$oss$2b$env$2d$nextjs$40$0$2e$13$2e$11$2b$0e2685038e47603a$2f$node_modules$2f40$t3$2d$oss$2f$env$2d$nextjs$2f$dist$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["createEnv"])({
    server: {
        // `.trim()` partout : les env Vercel sont régulièrement pollués par un
        // `\n` final (posées via echo au lieu de printf). Un client_secret Discord
        // avec newline → Discord renvoie invalid_client à l'échange de code → aucun
        // ba_user créé → login "marche" mais ne persiste pas. Cf. mémoire
        // vercel-env-newline-pollution.
        DATABASE_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().url(),
        BETTER_AUTH_SECRET: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(32),
        BETTER_AUTH_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().url().optional(),
        DISCORD_CLIENT_ID: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(10),
        DISCORD_CLIENT_SECRET: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(10),
        BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1).optional(),
        BUN_VIDEO_CRUNCHYROLL_BASIC_AUTHORIZATION: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().regex(/^Basic [A-Za-z0-9+/]+=*$/).optional(),
        BUN_VIDEO_CRUNCHYROLL_ACCOUNT_ID: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1).optional(),
        CRUNCHYROLL_EMAIL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().email().optional(),
        CRUNCHYROLL_PASSWORD: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).optional(),
        SHENRON_API_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().url().default(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_PUBLIC_ORIGINS"].api),
        // Read-only Shenron MCP server behind /mcp (shenron-mcp --http <addr> --public).
        // Hôte Bun (`shenron-server`) : si posée, il sert `/api/auth/*` (relais) et la session.
        SHENRON_HOST_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().url().optional(),
        SHENRON_MCP_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().url().optional(),
        SHENRON_ADMIN_TOKEN: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(16).optional(),
        // Adresses ou CIDR d'administration (`@/lib/admin-ip`) : staff sans session ni jeton.
        SHENRON_ADMIN_IPS: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().optional(),
        SHENRON_USER_SECRET: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(32).optional(),
        OWNER_ID: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().regex(/^\d{17,20}$/).optional(),
        OAUTH_ALLOWED_USERS: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional().transform((v)=>v ? v.split(",").map((s)=>s.trim()).filter(Boolean) : []),
        NODE_ENV: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
            "development",
            "production",
            "test"
        ]).default("development")
    },
    client: {
        NEXT_PUBLIC_SHENRON_ASSETS_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().url().optional(),
        // Base publique de l'API bot (assets self-hostés) — utilisable côté client
        // (ex. assetUrl dans le jeu 2048). Distincte de SHENRON_API_URL (server-only).
        NEXT_PUBLIC_SHENRON_API_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().url().optional(),
        // URL publique du site + invitation Discord — résolues dans `@/lib/config`
        // (source unique des URL). Déclarées ici pour validation/typage.
        NEXT_PUBLIC_SITE_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().url().optional(),
        NEXT_PUBLIC_DISCORD_INVITE_URL: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().url().optional(),
        NEXT_PUBLIC_GTM_ID: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
        NEXT_PUBLIC_GA_ID: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
        NEXT_PUBLIC_ADSENSE_CLIENT: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
        // IDs des blocs AdSense (`data-ad-slot`, 10 chiffres). Résolus par
        // `@/lib/ads` ; un emplacement sans ID reste éteint. Les annonces
        // automatiques ne dépendent d'aucun de ces IDs.
        NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
        NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
        NEXT_PUBLIC_ADSENSE_SLOT_INFEED: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
        NEXT_PUBLIC_ADSENSE_LAYOUT_KEY_INFEED: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
        NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
        NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
    },
    experimental__runtimeEnv: {
        NEXT_PUBLIC_SHENRON_ASSETS_URL: ("TURBOPACK compile-time value", "https://cdn.dragonballfr.com"),
        NEXT_PUBLIC_SHENRON_API_URL: ("TURBOPACK compile-time value", "https://bot.dragonballfr.com"),
        NEXT_PUBLIC_SITE_URL: ("TURBOPACK compile-time value", "http://127.0.0.1:3111"),
        NEXT_PUBLIC_DISCORD_INVITE_URL: ("TURBOPACK compile-time value", ""),
        NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
        NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
        NEXT_PUBLIC_ADSENSE_CLIENT: process.env.NEXT_PUBLIC_ADSENSE_CLIENT,
        NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE: process.env.NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE,
        NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DISPLAY,
        NEXT_PUBLIC_ADSENSE_SLOT_INFEED: process.env.NEXT_PUBLIC_ADSENSE_SLOT_INFEED,
        NEXT_PUBLIC_ADSENSE_LAYOUT_KEY_INFEED: process.env.NEXT_PUBLIC_ADSENSE_LAYOUT_KEY_INFEED,
        NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX: process.env.NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX,
        NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    },
    // Skip validation au build (Vercel injecte les env vars au runtime,
    // pas toutes en build-time). Le runtime crash de toute façon si une
    // var manque (auth(), db(), etc. throwent leurs propres erreurs).
    skipValidation: process.env.SKIP_ENV_VALIDATION === "1" || process.env.npm_lifecycle_event === "lint" || process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build",
    emptyStringAsUndefined: true
});
}),
"[project]/apps/site/src/lib/host-auth.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AUTH_RELAY_HEADER",
    ()=>AUTH_RELAY_HEADER,
    "authUnavailable",
    ()=>authUnavailable,
    "hostAuthUrl",
    ()=>hostAuthUrl,
    "hostGetSession",
    ()=>hostGetSession,
    "proxyAuthToHost",
    ()=>proxyAuthToHost,
    "sessionAuth",
    ()=>sessionAuth
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/public-urls.ts [middleware] (ecmascript)");
;
function hostAuthUrl() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveHostUrl"])(process.env) ?? null;
}
const FORWARDED = [
    "cookie",
    "authorization",
    "user-agent",
    "x-forwarded-for",
    "x-real-ip"
];
const AUTH_RELAY_HEADER = "x-shenron-auth-relay";
function forwardHeaders(source) {
    const out = new Headers();
    for (const name of FORWARDED){
        const value = source.get(name);
        if (value) out.set(name, value);
    }
    return out;
}
async function proxyAuthToHost(request, host, timeoutMs = 15_000) {
    // A misconfigured front must not relay the same OAuth request back to itself.
    if (request.headers.has(AUTH_RELAY_HEADER)) return authUnavailable();
    const url = new URL(request.url);
    const target = new URL(`${url.pathname}${url.search}`, host);
    const headers = forwardHeaders(request.headers);
    for (const name of [
        "content-type",
        "origin",
        "referer"
    ]){
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
    headers.set(AUTH_RELAY_HEADER, "1");
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    return fetch(target, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: "manual",
        signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(timeoutMs)
        ])
    });
}
async function hostGetSession(host, headers) {
    try {
        const target = new URL("/api/auth/get-session", host);
        // Read the live auth user rather than an older signed cookie snapshot.
        target.searchParams.set("disableCookieCache", "true");
        const response = await fetch(target, {
            headers: forwardHeaders(headers),
            signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok) return null;
        const body = await response.json().catch(()=>null);
        const user = body?.user;
        if (typeof user?.id !== "string") return null;
        return {
            user: {
                id: user.id,
                name: typeof user.name === "string" ? user.name : null,
                image: typeof user.image === "string" ? user.image : null
            }
        };
    } catch  {
        return null;
    }
}
function authUnavailable() {
    return Response.json({
        error: "auth_unavailable"
    }, {
        status: 503,
        headers: {
            "Cache-Control": "private, no-store"
        }
    });
}
const sessionAuth = {
    handler: async (request)=>{
        const host = hostAuthUrl();
        if (!host) return authUnavailable();
        try {
            return await proxyAuthToHost(request, host);
        } catch  {
            return authUnavailable();
        }
    },
    api: {
        getSession: async ({ headers })=>{
            const host = hostAuthUrl();
            return host ? hostGetSession(host, headers) : null;
        }
    }
};
}),
"[project]/apps/site/src/lib/host-launch-error.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
__turbopack_context__.s([
    "HostLaunchError",
    ()=>HostLaunchError
]);
class HostLaunchError extends Error {
    status;
    constructor(status){
        super("Bun launch configuration unavailable"), this.status = status;
        this.name = "HostLaunchError";
    }
}
}),
"[project]/apps/site/src/lib/legacy-routes.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
__turbopack_context__.s([]);
;
}),
"[project]/apps/site/src/lib/library.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LIBRARY_TABS",
    ()=>LIBRARY_TABS,
    "WORKSHOP_TABS",
    ()=>WORKSHOP_TABS,
    "isWorkshopStaffPath",
    ()=>isWorkshopStaffPath,
    "libraryTabFor",
    ()=>libraryTabFor,
    "workshopTabFor",
    ()=>workshopTabFor
]);
/**
 * library — l'espace unique des planches : lire (manga, databooks), transcrire, traduire
 * et éditer (Shenron Studio).
 *
 * Six écrans parlaient des mêmes planches sans se connaître : le lecteur manga, le catalogue
 * public des databooks, son double d'administration (catalogue et campagnes de traduction),
 * l'écran des transcriptions, l'éditeur Shenron Studio et, au milieu, aucune page qui dise au lecteur
 * où en est le travail. Ils forment désormais un seul espace, à onglets-liens :
 *
 *   Manga · Databooks · Transcription et traduction (`/workshop`) · Studio
 *
 * Les adresses publiques du manga et des databooks ne bougent pas (elles sont indexées) ;
 * les outils staff quittent `/admin` pour l'atelier (`/workshop`), où le proxy les garde
 * comme `/admin`. Les anciennes adresses (`/atelier/*`, `/admin/databooks`,
 * `/admin/transcriptions`) vivent dans `lib/legacy-routes.ts`.
 *
 * Client-safe : aucune base, aucun secret. Ce registre n'accorde aucun droit ; l'accès réel
 * reste arbitré par `proxy.ts` (préfixes staff) et `requireAdmin()` dans chaque page staff.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$legacy$2d$routes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/lib/legacy-routes.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$legacy$2d$routes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/legacy-routes.ts [middleware] (ecmascript)");
;
const LIBRARY_TABS = [
    {
        href: "/wiki/manga",
        labelKey: "library.tabs.manga",
        prefixes: [
            "/wiki/manga"
        ]
    },
    {
        href: "/wiki/databooks",
        labelKey: "library.tabs.databooks",
        prefixes: [
            "/wiki/databooks"
        ]
    },
    {
        href: "/workshop",
        labelKey: "library.tabs.workshop",
        prefixes: [
            "/workshop"
        ]
    },
    {
        href: "/studio",
        labelKey: "library.tabs.studio",
        prefixes: [
            "/studio"
        ]
    }
];
const WORKSHOP_TABS = [
    {
        href: "/workshop",
        labelKey: "library.workshop.tabs.overview",
        staff: false
    },
    {
        href: "/workshop/transcription",
        labelKey: "library.workshop.tabs.transcription",
        staff: true
    },
    {
        href: "/workshop/translation",
        labelKey: "library.workshop.tabs.translation",
        staff: true
    }
];
;
const within = (pathname, prefix)=>pathname === prefix || pathname.startsWith(`${prefix}/`);
function isWorkshopStaffPath(pathname) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$legacy$2d$routes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WORKSHOP_STAFF_PREFIXES"].some((prefix)=>within(pathname, prefix));
}
function libraryTabFor(pathname) {
    return LIBRARY_TABS.find((tab)=>tab.prefixes.some((prefix)=>within(pathname, prefix)))?.href ?? null;
}
function workshopTabFor(pathname) {
    if (within(pathname, "/workshop/transcription") || within(pathname, "/workshop/databooks")) return "/workshop/transcription";
    if (within(pathname, "/workshop/translation")) return "/workshop/translation";
    return "/workshop";
}
}),
"[project]/apps/site/src/lib/member-roles.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * member-roles — rôles Discord d'un visiteur, pour le contrôle d'accès par rôle
 * (`/admin/launch`, appliqué dans `proxy.ts`).
 *
 * Le site ne stocke PAS les rôles : ils changent côté Discord sans prévenir et un
 * miroir en base serait périmé en permanence. La source de vérité est le bot, qui
 * porte l'intent privilégié `GuildMembers` et garde tous les membres en cache —
 * `/api/discord/members?search=<snowflake>` renvoie déjà `roleIds` (fetch REST
 * par ID avec repli cache côté bot).
 *
 * Contraintes du hot-path (le proxy passe ici sur chaque requête gardée) :
 *   - cache mémoire 60 s par utilisateur, sinon un aller-retour HTTP par
 *     navigation ;
 *   - timeout court : un bot lent ne doit jamais figer le rendu du site ;
 *   - **fail-closed** — bot injoignable ⇒ aucun rôle ⇒ accès refusé. L'inverse
 *     transformerait une panne du bot en ouverture publique de pages privées.
 */ __turbopack_context__.s([
    "getMemberRoleIds",
    ()=>getMemberRoleIds
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/env.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/config.ts [middleware] (ecmascript)");
;
;
;
/** `SHENRON_ADMIN_TOKEN` (alias `API_ADMIN_TOKEN`), blanc = absent. */ const TOKEN = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envFirst"])(process.env, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ENV_ALIASES"].adminToken)?.value ?? "";
const TTL_MS = 60_000;
/** Au-delà, on vide : le cache sert le trafic chaud, pas un annuaire complet. */ const MAX_ENTRIES = 2_000;
const TIMEOUT_MS = 2_000;
const cache = new Map();
async function getMemberRoleIds(discordId) {
    if (!discordId || !/^\d{17,20}$/.test(discordId)) return [];
    const now = Date.now();
    const hit = cache.get(discordId);
    if (hit && now - hit.ts < TTL_MS) return hit.roles;
    let roles = [];
    try {
        const res = await fetch(`${__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["API_URL"]}/api/discord/members?limit=1&search=${encodeURIComponent(discordId)}`, {
            headers: {
                accept: "application/json",
                authorization: `Bearer ${TOKEN}`
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: "no-store"
        });
        if (res.ok) {
            const data = await res.json();
            const member = data.members?.find((m)=>m.id === discordId);
            roles = member?.roleIds ?? [];
        }
    } catch (e) {
        // Panne/timeout du bot : on ne met PAS en cache pour retenter au prochain
        // passage, et on renvoie le dernier état connu s'il existe (moins brutal
        // qu'une déconnexion apparente pour un membre légitime pendant un restart).
        console.error("[member-roles] bot injoignable :", e);
        return hit?.roles ?? [];
    }
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(discordId, {
        roles,
        ts: now
    });
    return roles;
}
}),
"[project]/apps/site/src/lib/proxy-admin.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "resolveVisitor",
    ()=>resolveVisitor
]);
/**
 * Résolution admin **directe** pour le proxy (`proxy.ts`), sans aller-retour
 * réseau vers `/api/me`.
 *
 * Historique : le proxy faisait `fetch("/api/me")` sur `request.nextUrl.origin`.
 * Côté VPS, cet origin est en `http://` (connexion interne nginx→Next) → nginx
 * répond `301 → https` et undici (fetch Node) **droppe l'en-tête Cookie** au
 * changement de schéma (origin cross) → `/api/me` ne voit plus la session → admin
 * traité comme anonyme et redirigé vers l'accueil (bug « je ne vois pas les pages
 * wiki/tierlist en tant qu'admin »). En prime : rate-limit nginx `/api/`, TLS et
 * timeout 2500 ms fail-closed.
 *
 * Le proxy Next 16 tourne en **runtime Node.js** (cf. docs `proxy.md` : « Proxy
 * defaults to using the Node.js runtime ») → on peut lire la session Better Auth
 * et la DB Postgres directement, en process, à partir des en-têtes/cookies de la
 * requête (jamais `next/headers`, indispo dans le proxy). Zéro réseau, zéro nginx.
 *
 * Même politique staff que `lib/session.ts` (`staffPolicyFromEnv(env, "site")`) : token admin OU
 * `roleAdmin` persisté OU Discord ∈ `OWNER_ID`/`OAUTH_ALLOWED_USERS`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/sql/expressions/conditions.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$host$2d$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/host-auth.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$db$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/lib/db.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$db$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/db/schema.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/src/schema.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/auth/src/index.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/agent-keys.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/crypto.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$staff$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/staff.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$repos$2f$accounts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/src/repos/accounts.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/env.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$admin$2d$token$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/admin-token.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/lib/agent-keys.ts [middleware] (ecmascript) <locals>");
;
;
;
;
;
;
;
;
;
;
;
;
/** Lookup `ba_account` (provider discord), le même que `lib/session.ts`. */ const discordAccounts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$repos$2f$accounts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createDiscordAccountLookup"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$db$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"]);
async function resolveVisitor(request) {
    // 1) Admin par cookie signé HMAC
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$admin$2d$token$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["verifyAdminCookie"])(request.cookies.get(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$admin$2d$token$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ADMIN_COOKIE"])?.value)) {
        return {
            isAdmin: true,
            authenticated: true,
            discordId: null
        };
    }
    // 2) Admin par en-tête explicite x-admin-token
    const xAdminToken = request.headers.get("x-admin-token");
    if (xAdminToken && (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$admin$2d$token$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["verifyAdminTokenOrBearer"])(xAdminToken)) {
        return {
            isAdmin: true,
            authenticated: true,
            discordId: null
        };
    }
    // 3) Admin par Authorization: Bearer
    const bearer = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["parseBearer"])(request.headers);
    if (bearer) {
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$admin$2d$token$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["verifyAdminTokenOrBearer"])(bearer)) {
            return {
                isAdmin: true,
                authenticated: true,
                discordId: null
            };
        }
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["looksLikeAgentToken"])(bearer)) {
            const agent = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["authenticateAgent"])(request).catch(()=>null);
            if (agent && (agent.scopes.includes("moderate") || agent.scopes.includes("publish:articles") || agent.scopes.includes("write:articles"))) {
                return {
                    isAdmin: true,
                    authenticated: true,
                    discordId: null
                };
            }
        }
    }
    // 4) Session Discord (Better Auth) lue depuis les en-têtes de la requête.
    const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getSessionSafe"])(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$host$2d$auth$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["sessionAuth"], request.headers);
    if (!session?.user) return {
        isAdmin: false,
        authenticated: false,
        discordId: null
    };
    // Discord ID lié (même lookup que `session.ts`) → clé du user métier et de
    // la politique staff du site.
    const discordId = await discordAccounts.discordIdForUser(session.user.id);
    if (!discordId) return {
        isAdmin: false,
        authenticated: true,
        discordId: null
    };
    let isAdmin = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$staff$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["staffPolicyFromEnv"])({
        OWNER_ID: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["env"].OWNER_ID,
        OAUTH_ALLOWED_USERS: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["env"].OAUTH_ALLOWED_USERS.join(",")
    }, "site").isStaff(discordId);
    if (!isAdmin) {
        const [row] = await __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$db$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["db"].select({
            roleAdmin: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["users"].roleAdmin
        }).from(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["users"]).where((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["eq"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["users"].discordId, discordId)).limit(1);
        isAdmin = row?.roleAdmin === true;
    }
    return {
        isAdmin,
        authenticated: true,
        discordId
    };
}
}),
"[project]/apps/site/src/lib/wiki-launch-config.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/** Cached launch adapter; only the Bun host owns storage. */ __turbopack_context__.s([
    "getLaunchConfig",
    ()=>getLaunchConfig,
    "getOpenCategoryKeys",
    ()=>getOpenCategoryKeys,
    "saveLaunchConfig",
    ()=>saveLaunchConfig
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/public-urls.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2d$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/wiki-launch-config.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$client$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/api/src/client/index.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/endpoints.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$host$2d$launch$2d$error$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/host-launch-error.ts [middleware] (ecmascript)");
;
;
;
;
;
;
;
function hostLaunchClient(host, requestHeaders, adminToken) {
    const forward = Object.assign((input, init)=>{
        const headers = new Headers(init?.headers);
        for (const name of [
            "cookie",
            "user-agent",
            ...!adminToken ? [
                "authorization"
            ] : []
        ]){
            const value = requestHeaders?.get(name);
            if (value) headers.set(name, value);
        }
        return fetch(input, {
            ...init,
            headers,
            cache: "no-store"
        });
    }, {
        preconnect: fetch.preconnect
    });
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$client$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createShenronApiClient"])({
        baseUrl: host,
        fetch: forward,
        adminToken: ()=>adminToken ?? null
    });
}
async function readLaunchConfig() {
    const host = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveHostUrl"])(process.env);
    if (!host) return structuredClone(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2d$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_LAUNCH_CONFIG"]);
    const result = await hostLaunchClient(host).call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].wikiLaunch, {});
    if (!result.ok) throw new __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$host$2d$launch$2d$error$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["HostLaunchError"](result.kind === "http" ? result.status : 502);
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2d$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveLaunchConfig"])(result.value.config);
}
async function saveLaunchConfig(patch, by, requestHeaders, adminToken) {
    const host = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveHostUrl"])(process.env);
    if (!host) throw new __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$host$2d$launch$2d$error$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["HostLaunchError"](503);
    const result = await hostLaunchClient(host, requestHeaders, adminToken).call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].wikiLaunchSave, {
        body: patch
    });
    if (!result.ok) throw new __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$host$2d$launch$2d$error$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["HostLaunchError"](result.kind === "http" ? result.status : 502);
    const config = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2d$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveLaunchConfig"])(result.value.config);
    generation++;
    cached = {
        config,
        expires: Date.now() + TTL_MS
    };
    pending = null;
    return config;
}
const TTL_MS = 30_000;
let cached = null;
let pending = null;
let generation = 0;
async function getLaunchConfig() {
    if (cached && Date.now() < cached.expires) return cached.config;
    if (pending) return pending;
    const started = generation;
    const flight = readLaunchConfig().catch(()=>cached?.config ?? structuredClone(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2d$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_LAUNCH_CONFIG"])).then((config)=>{
        if (generation === started) cached = {
            config,
            expires: Date.now() + TTL_MS
        };
        return generation === started ? config : cached?.config ?? config;
    });
    pending = flight;
    try {
        return await flight;
    } finally{
        if (pending === flight) pending = null;
    }
}
async function getOpenCategoryKeys() {
    return (await getLaunchConfig()).openKeys;
}
}),
"[project]/apps/site/src/lib/wiki-launch.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
__turbopack_context__.s([]);
;
}),
"[project]/apps/site/src/proxy.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "proxy",
    ()=>proxy
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/next@vendor+next-fork+next-16.5.0-canary.5-dac376c6fe-80cae9ab.tgz+870695612a7a9ee7/node_modules/next/server.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/index.mjs [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$tokens$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/tokens.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$proxy$2d$admin$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/proxy-admin.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$admin$2d$ip$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/admin-ip.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$wiki$2d$launch$2d$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/lib/wiki-launch-config.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/lib/wiki-launch.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/wiki-launch.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$member$2d$roles$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/member-roles.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/site/src/lib/config.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$library$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/lib/library.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$legacy$2d$routes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/apps/site/src/lib/legacy-routes.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$legacy$2d$routes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/legacy-routes.ts [middleware] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
/** Hôte canonique dérivé de {@link SITE_URL} (source unique des URL publiques). */ const CANONICAL_HOST = new URL(__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["SITE_URL"]).host;
// proxy.ts = « middleware » de Next 16 (renommé middleware.ts → proxy.ts).
// Trois rôles : (1) canonicalisation du host vers dragonballfr.com ; (2) gating
// de l'espace /admin et des outils staff de l'atelier (`/workshop`), qu'un `redirect()` de layout ne peut PAS protéger sous
// streaming (cf. le bloc dédié plus bas) ; (3) gating bêta des sections non
// publiques (wiki hors catégories ouvertes, + tierlists), avec exception
// admin/owner. Cf. https://nextjs.org/docs/messages/middleware-to-proxy
//
// Les catégories publiques ne sont PLUS codées en dur : elles viennent de la DB
// (`wiki-launch-config`, singleton WikiLaunch, cache TTL) → bascule live depuis
// /admin/launch. Repli défaut = catégories bêta (episodes/films/manga/chrono).
/**
 * Présence d'identifiants d'authentification (session Better Auth, token admin ou en-tête API).
 */ const SESSION_COOKIE_PREFIX = "better-auth";
function hasAuthCredentials(request) {
    if (request.cookies.has(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$tokens$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ADMIN_COOKIE"])) return true;
    if (request.headers.has("x-admin-token")) return true;
    if (request.headers.has("authorization")) return true;
    if (request.nextUrl.searchParams.has("admin_token")) return true;
    if (request.nextUrl.searchParams.has("token") && (request.nextUrl.pathname.startsWith("/admin") || isStaffPath(request.nextUrl.pathname))) {
        return true;
    }
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getSessionCookie"])(request, {
        cookiePrefix: SESSION_COOKIE_PREFIX
    }) !== null;
}
/**
 * Outils staff hors `/admin` : l'atelier (`/workshop/…`) et toute ancienne adresse
 * staff (`/atelier/traduction`…), gardée AVANT son 308 pour qu'un anonyme n'apprenne rien.
 */ function isStaffPath(pathname) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$library$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["isWorkshopStaffPath"])(pathname) || (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$legacy$2d$routes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["staffLegacyRedirect"])(pathname) !== null;
}
const ANONYMOUS = {
    isAdmin: false,
    authenticated: false,
    discordId: null
};
const ADMIN_BY_IP = {
    isAdmin: true,
    authenticated: true,
    discordId: null
};
/**
 * Identité du visiteur, résolue **en process** (Node.js runtime du proxy) via
 * `resolveVisitor` : token admin OU session Discord
 * (OWNER_ID/OAUTH_ALLOWED_USERS/roleAdmin) — plus de `fetch("/api/me")` fragile
 * (le self-fetch se faisait droper le Cookie au 301 http→https de nginx →
 * l'admin était redirigé). Fast-path sans cookie d'auth = anonyme (coût zéro).
 * Fail-closed : toute erreur → anonyme (jamais d'exposition par défaut).
 */ async function visitorOf(request) {
    // Poste d'administration (`SHENRON_ADMIN_IPS`) : staff, avec ou sans session.
    const byIp = (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$admin$2d$ip$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["isAdminIp"])(request.headers);
    if (!hasAuthCredentials(request)) return byIp ? ADMIN_BY_IP : ANONYMOUS;
    try {
        const visitor = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$proxy$2d$admin$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveVisitor"])(request);
        return byIp && !visitor.isAdmin ? {
            ...visitor,
            isAdmin: true,
            authenticated: true
        } : visitor;
    } catch  {
        return byIp ? ADMIN_BY_IP : ANONYMOUS;
    }
}
/** Rubriques retirées → leur hub (redirections permanentes sans donnée). */ const LEGACY_WIKI_REDIRECTS = {
    "/wiki/manga/interviews": "/wiki/interviews",
    "/wiki/contributors": "/wiki/staff"
};
/** 308 vers `target`, la requête d'origine conservée (sans écraser celle de la cible). */ function permanentTo(request, target) {
    const url = new URL(target, request.url);
    for (const [key, value] of request.nextUrl.searchParams){
        if (!url.searchParams.has(key)) url.searchParams.append(key, value);
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url, 308);
}
async function proxy(request) {
    const host = request.headers.get("host") || "";
    // Rediriger vers le domaine unique canonique si la requête provient d'un autre hôte,
    // tout en autorisant localhost en local. S2 (docs/architecture/STACK.md §2.2) : les hôtes de
    // preview Vercel (`*.vercel.app`) ne passent plus — ils sont redirigés comme
    // l'alias de prod dbfr.vercel.app.
    if (host && host !== CANONICAL_HOST && !host.includes("localhost") && !host.includes("127.0.0.1")) {
        const url = request.nextUrl.clone();
        url.host = CANONICAL_HOST;
        url.protocol = "https";
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url, 308);
    }
    const { pathname } = request.nextUrl;
    // Anciennes rubriques dont la page n'est plus qu'un `permanentRedirect()` de
    // composant. Sous le layout `/wiki` (streaming), ce redirect dégrade en
    // **200 + `<meta http-equiv="refresh">`** — mesuré le 2026-09-23 sur
    // /wiki/cosmologie, /wiki/planetes (308 vers cosmologie puis 200) et
    // /wiki/manga/interviews : une page vide, sans `<h1>`, indexable. Le 308 est
    // donc rendu ICI, avant tout rendu ; les composants restent en défense.
    const legacyTarget = LEGACY_WIKI_REDIRECTS[pathname];
    if (legacyTarget) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL(legacyTarget, request.url), 308);
    }
    // Anciennes adresses publiques en français (`/wiki/personnages`, `/jeux`…) : leur 308
    // part de `redirects()` dans `next.config.ts`, qui passe AVANT le proxy. Cette table
    // est la même (`lib/legacy-routes.ts`) ; elle sert ici de défense si la requête arrive
    // jusqu'au proxy (serveur sans la config de redirection).
    const publicTarget = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$legacy$2d$routes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["publicLegacyRedirect"])(pathname);
    if (publicTarget) return permanentTo(request, publicTarget);
    // Journal / News : l'ancienne pagination `?page=N` est morte. Lire `searchParams`
    // dans une page la rend dynamique sous Next 16 (`no-store`), donc l'index le
    // plus crawlé du site n'était jamais caché — la pagination vit maintenant sous
    // `/news/page/N`, prérendue. La récupération des vieux liens se fait ICI
    // et pas dans `redirects()` de next.config : Next y recopie la query dans la
    // destination, ce qui reboucle à l'infini sur `?page=1`.
    if ((pathname === "/news" || pathname === "/actualites") && request.nextUrl.searchParams.has("page")) {
        const raw = request.nextUrl.searchParams.get("page") ?? "1";
        const n = /^[0-9]+$/.test(raw) ? Number(raw) : 1;
        const target = new URL(n >= 2 ? `/news/page/${n}` : "/news", request.url);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(target, 308);
    }
    // Espace d'administration : arbitré ICI, avant tout rendu.
    //
    // `app/admin/layout.tsx` appelle bien `requireAdmin()`, mais sous Next 16 le
    // layout et ses enfants sont **streamés en parallèle** : le `redirect()` du
    // layout part dans le flux RSC alors que les pages ont déjà été rendues et
    // que leur charge utile est déjà émise. Un anonyme recevait donc un 200 avec
    // les données — mesuré le 2026-08-22 sur la prod : 851 Kio de titres sur
    // /admin/db-universe/databooks, et 470 Kio contenant 7 032 segments de
    // japonais transcrit sur /admin/databooks/19 (aujourd'hui /workshop/databooks/19).
    //
    // C'est la même mécanique que le 308 de `/wiki/dragon-ball`, qui a dû quitter
    // le composant pour `next.config` : sous streaming, une redirection de layout
    // n'empêche pas le rendu de ce qu'elle est censée protéger. Seul le proxy
    // s'exécute avant le rendu.
    //
    // `requireAdmin()` reste en place dans le layout — défense en profondeur, et
    // il couvre les chemins qui n'entrent pas dans le matcher du proxy.
    //
    // Les outils staff de l'atelier (transcription, traduction, relecture) ont quitté
    // `/admin` pour l'espace Bibliothèque (`/workshop`) : ils passent par la même garde.
    // Les anciennes adresses (`/admin/databooks`, `/atelier/traduction`, `/admin/ai`…)
    // répondent un 308, APRÈS la garde (un anonyme ne découvre rien).
    if (pathname === "/admin" || pathname.startsWith("/admin/") || isStaffPath(pathname)) {
        const visitor = await visitorOf(request);
        if (!visitor.isAdmin) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL("/", request.url));
        }
        const moved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$legacy$2d$routes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["staffLegacyRedirect"])(pathname);
        if (moved) return permanentTo(request, moved);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    }
    // Contrôle d'accès par rubrique : chaque catégorie wiki et chaque section du
    // site porte un mode (public / connectés / rôles Discord / staff) piloté depuis
    // /admin/launch. Le code des pages reste intact — seul l'accès est arbitré
    // ici. Le staff traverse tout.
    const entry = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["findEntry"])(pathname);
    // `/wiki` EXACTEMENT — le sommaire de l'encyclopédie — est public. Il n'a pas
    // d'entrée au registre (une entrée de préfixe `/wiki` ouvrirait aussi tous
    // ses enfants, y compris les rubriques fermées), et retombait donc sur la
    // règle « hors registre sous /wiki ⇒ fermé » : la page d'accueil du wiki
    // renvoyait tout le monde sur le teaser « En préparation », alors qu'elle ne
    // fait que lister des rubriques dont chacune est déjà gardée par la sienne.
    if (pathname === "/wiki") return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    // Un FICHIER sous /wiki/ n'est pas une rubrique : c'est un asset de
    // `public/wiki/` (poster de scène, vignette de personnage, planche de
    // databook). La règle « hors registre sous /wiki ⇒ fermé » l'attrapait, et
    // `dragonballfr.com/wiki/taopaipai.poster.webp` répondait 307 vers le teaser
    // en PRODUCTION — mesuré, pas supposé. En cascade, `next/image` échouait à
    // charger le poster et le héros de l'accueil tombait sur sa frontière
    // d'erreur un tirage sur deux (les clips de fond sont pioches au hasard).
    //
    // L'extension est le bon discriminant : aucune rubrique du registre n'en
    // porte, et le dernier segment d'une page wiki est un slug (`/wiki/manga`,
    // `/wiki/characters/son-goku`). Les points d'un slug — il n'y en a pas —
    // seraient de toute façon rattrapés par le registre, qui passe avant.
    if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    const isWiki = pathname.startsWith("/wiki/");
    // Une page WikiPage transversale peut avoir un slug sans rubrique dédiée dans
    // le registre (pages sources, archives et dossiers enrichis). Si elle existe,
    // la route dynamique la résout ; le proxy ne doit pas la masquer derrière le
    // teaser. Les rubriques enregistrées restent soumises à leur règle d'accès.
    if (!entry && isWiki) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    // Hors registre, partout ailleurs la page est publique (accueil, à propos,
    // crédits…).
    if (!entry && !isWiki) return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    const cfg = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$wiki$2d$launch$2d$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["getLaunchConfig"])();
    const rule = entry ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveAccess"])(entry.key, cfg) : {
        mode: "admin",
        roleIds: []
    };
    if (rule.mode === "public") return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    const visitor = await visitorOf(request);
    let allowed = visitor.isAdmin;
    if (!allowed && rule.mode === "members") {
        allowed = visitor.authenticated;
    } else if (!allowed && rule.mode === "roles" && visitor.discordId) {
        const held = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$site$2f$src$2f$lib$2f$member$2d$roles$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["getMemberRoleIds"])(visitor.discordId);
        allowed = held.some((r)=>rule.roleIds.includes(r));
    }
    if (!allowed) {
        // Au lieu de renvoyer silencieusement le visiteur sur la marketing home
        // (aucun contexte, dead-end), on le redirige vers un écran « en préparation »
        // dédié (noindex) qui explique et propose les sections déjà ouvertes. On
        // construit la cible depuis `request.url` (Host nginx = dragonballfr.com) et
        // non `nextUrl.clone()` (host interne localhost:3000 → tentative de proxy
        // externe ECONNREFUSED). Le contenu gated n'est jamais rendu.
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL(`/coming-soon?from=${encodeURIComponent(pathname)}`, request.url));
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$next$40$vendor$2b$next$2d$fork$2b$next$2d$16$2e$5$2e$0$2d$canary$2e$5$2d$dac376c6fe$2d$80cae9ab$2e$tgz$2b$870695612a7a9ee7$2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
}
const config = {
    matcher: [
        /*
     * Appliquer le proxy sur toutes les routes sauf :
     * - api (les routes API peuvent être interrogées directement ou recevoir des webhooks ;
     *   exclure /api garantit aussi zéro boucle sur le fetch admin /api/me)
     * - _next/static (fichiers statiques Next.js)
     * - _next/image (optimisation d'images)
     * - favicon.ico, sitemap.xml, robots.txt (métadonnées)
     */ "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"
    ]
};
}),
"[project]/packages/api/src/client/index.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-api/client` — typed client of the Shenron HTTP contract that never
 * throws: every call resolves to an {@link ApiResult}. Runtime class: `pure`
 * (no hono, no node:, no bun:; the acting-user signer is injected).
 *
 * `fetch` is resolved at each call (`options.fetch ?? globalThis.fetch`), so a
 * test or an instrumentation layer that replaces `globalThis.fetch` after the
 * client was created is honoured.
 */ __turbopack_context__.s([
    "DEFAULT_TIMEOUT_MS",
    ()=>DEFAULT_TIMEOUT_MS,
    "createShenronApiClient",
    ()=>createShenronApiClient
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$aphrody$2b$http$40$0$2e$1$2e$1$2f$node_modules$2f40$aphrody$2f$http$2f$src$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@aphrody+http@0.1.1/node_modules/@aphrody/http/src/index.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/endpoints.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$error$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/error.ts [middleware] (ecmascript)");
;
;
;
;
const DEFAULT_TIMEOUT_MS = 10_000;
function joinUrl(baseUrl, path) {
    const base = new URL(String(baseUrl));
    const prefix = base.pathname.replace(/\/+$/, "");
    return new URL(`${prefix}${path}`, base.origin);
}
function appendQuery(url, query) {
    if (!query || typeof query !== "object") return;
    for (const [key, value] of Object.entries(query)){
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
    }
}
function errorText(error) {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
}
function isTimeout(error) {
    return typeof error === "object" && error !== null && "name" in error && (error.name === "TimeoutError" || error.name === "AbortError");
}
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return undefined;
}
/**
 * Lenient page metadata: numeric strings are coerced, a missing `total` falls
 * back to the number of rows, a missing `limit`/`offset` to the request query.
 */ function normalisePage(value, query) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const page = {
        ...value
    };
    const list = Array.isArray(page.items) ? page.items : Array.isArray(page.rows) ? page.rows : null;
    if (!list) return value;
    const q = query && typeof query === "object" ? query : {};
    page.total = toNumber(page.total) ?? list.length;
    page.limit = toNumber(page.limit) ?? toNumber(q.limit) ?? list.length;
    page.offset = toNumber(page.offset) ?? toNumber(q.offset) ?? 0;
    return page;
}
function issuesOf(error) {
    return error.issues.map((issue)=>`${issue.path.join(".") || "(root)"}: ${issue.message}`);
}
function createShenronApiClient(o) {
    const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    async function call(endpoint, input) {
        const loose = input;
        let path;
        try {
            path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["fillPath"])(endpoint.path, loose.params);
        } catch (error) {
            return {
                ok: false,
                kind: "unreachable",
                path: endpoint.path,
                detail: errorText(error)
            };
        }
        const url = joinUrl(o.baseUrl, path);
        appendQuery(url, loose.query);
        const headers = new Headers({
            Accept: "application/json"
        });
        if (o.userAgent) headers.set("User-Agent", o.userAgent);
        if (endpoint.auth === "admin" && o.adminToken) {
            const token = o.adminToken();
            if (token) headers.set("Authorization", `Bearer ${token}`);
        }
        if (loose.actingUserId && o.signActingUser) {
            for (const [k, v] of Object.entries(o.signActingUser(loose.actingUserId)))headers.set(k, v);
        }
        let body;
        if (endpoint.method === "post") {
            headers.set("Content-Type", "application/json");
            body = JSON.stringify(loose.body ?? {});
        }
        let response;
        let json;
        try {
            const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$aphrody$2b$http$40$0$2e$1$2e$1$2f$node_modules$2f40$aphrody$2f$http$2f$src$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["requestJson"])(url, {
                method: endpoint.method.toUpperCase(),
                headers,
                body
            }, {
                fetch: o.fetch,
                timeoutMs,
                readErrorBody: true
            });
            response = result.response;
            json = result.value;
        } catch (failure) {
            const error = failure instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$aphrody$2b$http$40$0$2e$1$2e$1$2f$node_modules$2f40$aphrody$2f$http$2f$src$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["JsonTransportError"] ? failure.cause : failure;
            return {
                ok: false,
                kind: failure instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$aphrody$2b$http$40$0$2e$1$2e$1$2f$node_modules$2f40$aphrody$2f$http$2f$src$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["JsonTransportError"] && failure.stage === "json" ? "invalid_json" : isTimeout(error) || failure instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$aphrody$2b$http$40$0$2e$1$2e$1$2f$node_modules$2f40$aphrody$2f$http$2f$src$2f$index$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["JsonTransportError"] && failure.timedOut ? "timeout" : "unreachable",
                path,
                detail: errorText(error)
            };
        }
        if (!response.ok) {
            const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$error$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ErrorEnvelope"].safeParse(json);
            const error = parsed.success ? parsed.data : undefined;
            return {
                ok: false,
                kind: "http",
                path,
                status: response.status,
                detail: error?.error ?? `HTTP ${response.status}`,
                ...error ? {
                    error
                } : {}
            };
        }
        const candidate = endpoint.paginated ? normalisePage(json, loose.query) : json;
        const parsed = endpoint.response.safeParse(candidate);
        if (!parsed.success) {
            const issues = issuesOf(parsed.error);
            return {
                ok: false,
                kind: "invalid_response",
                path,
                detail: issues[0] ?? "invalid response",
                issues
            };
        }
        const etag = response.headers.get("etag");
        return {
            ok: true,
            value: parsed.data,
            status: response.status,
            ...etag ? {
                etag
            } : {}
        };
    }
    return {
        call,
        wiki: {
            categories: ()=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].wikiCategories, {}),
            list: (category, query)=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].wikiList, {
                    params: {
                        category
                    },
                    query
                }),
            get: (category, idOrSlug)=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].wikiEntity, {
                    params: {
                        category,
                        idOrSlug: String(idOrSlug)
                    }
                })
        },
        rag: {
            search: (q)=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].ragSearch, {
                    query: q
                }),
            context: (q)=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].ragContext, {
                    query: q
                })
        },
        cockpit: {
            createGoal: (b)=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].createGoal, {
                    body: b
                }),
            completeGoal: (id, b = {})=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].completeGoal, {
                    params: {
                        id
                    },
                    body: b
                }),
            setFeedbackStatus: (id, b)=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].feedbackStatus, {
                    params: {
                        id
                    },
                    body: b
                }),
            addGold: (b)=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].goldCase, {
                    body: b
                }),
            runEval: (b = {})=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].runEval, {
                    body: b
                })
        },
        admin: {
            stats: ()=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].adminStats, {}),
            services: ()=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].adminServices, {}),
            tables: ()=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].adminTables, {}),
            table: (name, page)=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].adminTableRows, {
                    params: {
                        table: name
                    },
                    query: page
                }),
            wikiStats: ()=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].adminWikiStats, {}),
            economyStats: ()=>call(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$endpoints$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["endpoints"].adminEconomyStats, {})
        }
    };
}
}),
"[project]/packages/api/src/contract/account.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AccountSessionProfile",
    ()=>AccountSessionProfile,
    "AccountSessionResponse",
    ()=>AccountSessionResponse
]);
// SPDX-License-Identifier: Apache-2.0
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .boolean>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$iso$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .iso>");
;
const AccountSessionProfile = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    discordId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    username: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    avatar: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    roleAdmin: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    createdAt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$iso$3e$__["z"].iso.datetime()
});
const AccountSessionResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    sessionUserId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    discordId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    user: AccountSessionProfile.nullable()
}).nullable().meta({
    id: "AccountSessionResponse"
});
}),
"[project]/packages/api/src/contract/chat.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CHAT_EVENT_TYPES",
    ()=>CHAT_EVENT_TYPES,
    "ChatAttachment",
    ()=>ChatAttachment,
    "ChatBackendId",
    ()=>ChatBackendId,
    "ChatBackendStatus",
    ()=>ChatBackendStatus,
    "ChatDone",
    ()=>ChatDone,
    "ChatErrorEvent",
    ()=>ChatErrorEvent,
    "ChatMeta",
    ()=>ChatMeta,
    "ChatModelEntry",
    ()=>ChatModelEntry,
    "ChatModelState",
    ()=>ChatModelState,
    "ChatRequest",
    ()=>ChatRequest,
    "ChatResponse",
    ()=>ChatResponse,
    "ChatSurface",
    ()=>ChatSurface,
    "ChatToolEvent",
    ()=>ChatToolEvent,
    "ChatTurn",
    ()=>ChatTurn,
    "ChatUsage",
    ()=>ChatUsage,
    "Citation",
    ()=>Citation,
    "ModelsResponse",
    ()=>ModelsResponse,
    "OcrRequest",
    ()=>OcrRequest,
    "OcrResponse",
    ()=>OcrResponse
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Unified chat contract: one request shape for the site, the desktop and the bot; one event
 * stream (SSE over `POST /api/v1/chat`, the same events over the `/api/v1/chat/ws` WebSocket)
 * with sources cited by number. Runtime class: `pure`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .boolean>");
;
const ChatSurface = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
    "site",
    "desktop",
    "bot"
]).meta({
    id: "ChatSurface"
});
const ChatBackendId = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
    "auto",
    "gemini-web",
    "local",
    "extractive"
]).meta({
    id: "ChatBackendId"
});
const ChatAttachment = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    /** `image/png`, `image/jpeg`, `image/webp`: the server OCRs it and cites the text. */ mediaType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "image/png",
        "image/jpeg",
        "image/webp"
    ]),
    /** Base64 payload (≤ 8 MiB decoded). */ data: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(11_200_000),
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(200).optional()
}).meta({
    id: "ChatAttachment"
});
const ChatTurn = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    role: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "user",
        "assistant"
    ]),
    content: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).max(16_000)
}).meta({
    id: "ChatTurn"
});
const ChatRequest = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    message: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1).max(4_000),
    /** Stable conversation id; the server stores both turns when a conversation store is wired. */ conversationId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^[A-Za-z0-9_:-]{8,64}$/).optional(),
    /** Client id of the user message (idempotent re-send); generated when absent. */ messageId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^[A-Za-z0-9_:-]{8,64}$/).optional(),
    surface: ChatSurface.default("site"),
    /** Previous turns when the client keeps the history itself (otherwise read from the store). */ history: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(ChatTurn).max(20).optional(),
    persona: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(32).optional(),
    backend: ChatBackendId.default("auto"),
    /**
     * Model of `GET /api/v1/models` (`models[].id`: `shenron-chat-v2`, `gemma4-e2b`,
     * `gemini-web/flash`); it overrides `backend`. Absent: the default model, then fallbacks.
     */ model: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^[a-z0-9][a-z0-9._/-]{0,63}$/).optional(),
    /** Retrieval: number of passages (default 6) and kinds filter. */ topK: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0).max(12).default(6),
    kinds: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(64)).max(16).optional(),
    /** Ask the dragonball.* MCP tools too (default true when the server has them). */ tools: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().default(true),
    attachments: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(ChatAttachment).max(4).optional(),
    /** `false` → one JSON `ChatResponse` instead of an event stream. */ stream: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().default(true),
    /**
     * Owner preferences recorded on the conversation. `memoryOptIn: false` also keeps this turn
     * out of the persistent memory (no recall, no writing); absent or true uses it when the
     * server has one.
     */ memoryOptIn: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional(),
    ragOptIn: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional()
}).meta({
    id: "ChatRequest"
});
const Citation = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    /** Number used in the answer (`[n]`). */ n: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(1),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    /** `vfs` (RAG of the VFS), `home` (agent home), `mcp:<tool>`, `ocr`, `asset`. */ source: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    snippet: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    score: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().optional()
}).meta({
    id: "Citation"
});
const ChatUsage = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    promptTokens: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().nullable(),
    completionTokens: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().nullable(),
    ms: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    firstTokenMs: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().nullable()
}).meta({
    id: "ChatUsage"
});
const ChatMeta = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    streamId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    conversationId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    messageId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    replyId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    persona: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    retrieval: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        mode: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
            "hybrid",
            "lexical",
            "none"
        ]),
        hits: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
        embedError: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
    })
}).meta({
    id: "ChatMeta"
});
const ChatToolEvent = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    ms: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    hits: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().optional(),
    error: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
}).meta({
    id: "ChatToolEvent"
});
const ChatDone = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    replyId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    conversationId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    backend: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    model: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    /** Backends tried before the one that answered, with their errors. */ fallbacks: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        backend: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        error: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    })),
    citations: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(Citation),
    usage: ChatUsage,
    finishReason: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "stop",
        "length",
        "aborted",
        "error"
    ]),
    stored: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    /**
     * Persistent memory of the turn, when the server has one: memories given to the model that
     * answered (none for a remote backend with SHENRON_MEMORY_REMOTE=off) and facts stored.
     */ memory: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        recalled: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0),
        stored: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0)
    }).optional()
}).meta({
    id: "ChatDone"
});
const ChatErrorEvent = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    code: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    message: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    retryable: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean()
}).meta({
    id: "ChatErrorEvent"
});
const CHAT_EVENT_TYPES = [
    "meta",
    "sources",
    "tool",
    "backend",
    "delta",
    "done",
    "error"
];
const ChatResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    meta: ChatMeta,
    answer: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    done: ChatDone,
    tools: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(ChatToolEvent)
}).meta({
    id: "ChatResponse"
});
const ChatBackendStatus = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    available: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    model: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    detail: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
}).meta({
    id: "ChatBackendStatus"
});
const ChatModelState = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
    "ready",
    "loading",
    "downloading",
    "installable",
    "failed",
    "unavailable"
]).meta({
    id: "ChatModelState"
});
const ChatModelEntry = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    /** Stable id sent back as `ChatRequest.model`. */ id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    label: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    /** Backend serving it (`local`, `gemini-web`). */ backend: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    /** `true`: a request can use it now (`ready`, or `loading` on demand). */ available: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    /** Model of requests that name none. */ default: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    /** The prompt leaves this machine (Gemini web). */ remote: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    state: ChatModelState,
    /** Download progress (`downloading`), in bytes. */ progress: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        received: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().nullable()
    }).optional(),
    /** `POST` here to download it (`installable`, `failed`), on the local server only. */ installUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    /** `POST { "path" }` here to import the adapter from a local file (no public source). */ importUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    detail: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
}).meta({
    id: "ChatModelEntry"
});
const ModelsResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    order: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()),
    backends: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(ChatBackendStatus),
    /** Selectable models, the default first; only those this server has or can install. */ models: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(ChatModelEntry),
    defaultModel: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    embedder: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        available: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
        model: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        detail: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
    })
}).meta({
    id: "ModelsResponse"
});
const OcrRequest = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"]// No `lang`: PP-OCRv5 (`aphrody ocr ppocr`) reads Japanese and Latin scripts on every page.
.object({
    attachment: ChatAttachment
}).meta({
    id: "OcrRequest"
});
const OcrResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    engine: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    text: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    regions: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
    ms: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
}).meta({
    id: "OcrResponse"
});
}),
"[project]/packages/api/src/contract/chronology.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ChronologyResponse",
    ()=>ChronologyResponse,
    "ChronologySaveResponse",
    ()=>ChronologySaveResponse,
    "ChronologySchema",
    ()=>ChronologySchema,
    "TimelineAtlasResponse",
    ()=>TimelineAtlasResponse,
    "TimelineEventSchema",
    ()=>TimelineEventSchema,
    "TimelineEventsQuery",
    ()=>TimelineEventsQuery,
    "TimelineEventsResponse",
    ()=>TimelineEventsResponse,
    "TimelineItemSchema",
    ()=>TimelineItemSchema,
    "TimelineItemsResponse",
    ()=>TimelineItemsResponse
]);
// SPDX-License-Identifier: Apache-2.0
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .boolean>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .literal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .record>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/chronology.ts [middleware] (ecmascript)");
;
;
const override = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    hidden: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional(),
    era: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ERA_ORDER"]).optional(),
    date: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().nullable().optional(),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    note: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    sort: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().optional()
});
const ChronologySchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    version: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(1),
    eraOrder: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ERA_ORDER"])),
    overrides: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), override)
}).meta({
    id: "Chronology"
});
const ChronologyResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    config: ChronologySchema
}).meta({
    id: "ChronologyResponse"
});
const ChronologySaveResponse = ChronologyResponse.extend({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true)
}).meta({
    id: "ChronologySaveResponse"
});
const TimelineItemSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "episode",
        "movie",
        "manga"
    ]),
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    href: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    titleJa: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    series: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    era: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ERA_ORDER"]),
    number: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().nullable(),
    date: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().nullable(),
    image: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    hasVf: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    hasVostfr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean()
});
const TimelineItemsResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    items: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(TimelineItemSchema)
}).meta({
    id: "TimelineItemsResponse"
});
const TimelineEventSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    age_year: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    age_month: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().nullable(),
    age_day: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().nullable(),
    era: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    title_ja: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    description: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    characters_involved: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()).nullable(),
    source_ref: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    canon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    order_idx: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
});
const TimelineEventsQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    era: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(128).optional()
});
const TimelineEventsResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    events: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(TimelineEventSchema)
}).meta({
    id: "TimelineEventsResponse"
});
const TimelineAtlasResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    sagas: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        slug: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        series: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        description: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
        image: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable()
    })),
    arcs: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        saga_id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        slug: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    })),
    databooks: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        cover: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
        category: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
        kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    }))
}).meta({
    id: "TimelineAtlasResponse"
});
}),
"[project]/packages/api/src/contract/endpoints.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ConversationParams",
    ()=>ConversationParams,
    "ENDPOINTS",
    ()=>ENDPOINTS,
    "LEGACY_PUBLIC_PATHS",
    ()=>LEGACY_PUBLIC_PATHS,
    "NumericIdParams",
    ()=>NumericIdParams,
    "StreamParams",
    ()=>StreamParams,
    "TableParams",
    ()=>TableParams,
    "WikiCategoryParams",
    ()=>WikiCategoryParams,
    "WikiEntityParams",
    ()=>WikiEntityParams,
    "endpoints",
    ()=>endpoints,
    "fillPath",
    ()=>fillPath
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Endpoint catalogue of the Shenron HTTP contract. Paths are complete
 * (`/api/public/wiki/{category}`): no nested `basePath`, which
 * `@hono/zod-openapi` mis-reports in the generated document
 * (honojs/middleware#952). Runtime class: `pure`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/wiki-launch.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .unknown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$looseObject$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .looseObject>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .literal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$instanceof$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .instanceof>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/pipeline/src/bxc/contracts.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$web$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/api/src/contract/web.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$favorites$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/favorites.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$favorites$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/favorites.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$account$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/account.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/chronology.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$page$2d$banners$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/page-banners.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$home$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/home.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$site$2d$theme$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/site-theme.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chat$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/chat.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$lexicon$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/lexicon.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$memory$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/memory.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$plugin$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/plugin.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/sync.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/api/src/contract/schemas.ts [middleware] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
const WikiCategoryParams = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    category: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WikiCategoryName"]
});
const WikiEntityParams = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    category: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WikiCategoryName"],
    idOrSlug: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).max(200)
});
const ConversationParams = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^[A-Za-z0-9_:-]{8,64}$/)
});
const StreamParams = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    streamId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^[A-Za-z0-9_-]{8,64}$/)
});
const NumericIdParams = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().positive()
});
const TableParams = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    table: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).max(100)
});
const WIKI_CACHE = {
    maxAgeSeconds: 3600
};
const endpoints = {
    webStatus: {
        id: "webStatus",
        method: "get",
        path: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WEB_PATHS"].status,
        auth: "admin",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$web$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["WebStatus"],
        cache: "no-store",
        native: true
    },
    webFramesStats: {
        id: "webFramesStats",
        method: "get",
        path: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WEB_PATHS"].framesStats,
        auth: "admin",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$web$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["WebFrameStats"],
        cache: "no-store",
        native: true
    },
    webFramesVector: {
        id: "webFramesVector",
        method: "post",
        path: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WEB_PATHS"].framesVector,
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WebImage"],
        maxBodyBytes: 24 * 1024 * 1024 + 1024,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$web$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["WebFrameVector"],
        cache: "no-store",
        native: true
    },
    webFramesSearch: {
        id: "webFramesSearch",
        method: "post",
        path: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WEB_PATHS"].framesSearch,
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WebFrameSearch"],
        maxBodyBytes: 24 * 1024 * 1024 + 1024,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$web$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["WebFrameMatches"],
        cache: "no-store",
        native: true
    },
    webMediaResolve: {
        id: "webMediaResolve",
        method: "post",
        path: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WEB_PATHS"].mediaResolve,
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WebMediaResolve"],
        maxBodyBytes: 8192,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$web$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["WebMediaSource"],
        cache: "no-store",
        native: true
    },
    webMediaSearch: {
        id: "webMediaSearch",
        method: "post",
        path: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WEB_PATHS"].mediaSearch,
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WebMediaSearch"],
        maxBodyBytes: 8192,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$web$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["WebMediaResults"],
        cache: "no-store",
        native: true
    },
    favorites: {
        id: "favorites",
        method: "get",
        path: "/api/v1/account/favorites",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$favorites$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["FavoritesResponse"],
        cache: "no-store",
        native: true
    },
    favoritesSave: {
        id: "favoritesSave",
        method: "post",
        path: "/api/v1/account/favorites",
        auth: "reader",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
            favorites: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown()
        }),
        maxBodyBytes: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$favorites$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["FAVORITES_BODY_MAX"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$favorites$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["FavoritesSaveResponse"],
        cache: "no-store",
        native: true
    },
    wikiLaunch: {
        id: "wikiLaunch",
        method: "get",
        path: "/api/v1/site/launch",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LaunchConfigResponse"],
        cache: "no-store",
        native: true
    },
    wikiLaunchSave: {
        id: "wikiLaunchSave",
        method: "post",
        path: "/api/v1/site/launch",
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LaunchPatchSchema"],
        maxBodyBytes: 512 * 1024,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LaunchConfigSaveResponse"],
        cache: "no-store",
        native: true
    },
    chronology: {
        id: "chronology",
        method: "get",
        path: "/api/v1/site/chronology",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ChronologyResponse"],
        cache: "no-store",
        native: true
    },
    chronologySave: {
        id: "chronologySave",
        method: "post",
        path: "/api/v1/site/chronology",
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown(),
        maxBodyBytes: 512 * 1024,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ChronologySaveResponse"],
        cache: "no-store",
        native: true
    },
    timelineItems: {
        id: "timelineItems",
        method: "get",
        path: "/api/v1/wiki/timeline",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["TimelineItemsResponse"],
        cache: "no-store",
        native: true
    },
    timelineEvents: {
        id: "timelineEvents",
        method: "get",
        path: "/api/v1/wiki/timeline/events",
        auth: "public",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["TimelineEventsQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["TimelineEventsResponse"],
        cache: "no-store",
        native: true
    },
    timelineAtlas: {
        id: "timelineAtlas",
        method: "get",
        path: "/api/v1/wiki/timeline/atlas",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chronology$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["TimelineAtlasResponse"],
        cache: "no-store",
        native: true
    },
    pageBanners: {
        id: "pageBanners",
        method: "get",
        path: "/api/v1/site/banners",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$page$2d$banners$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["PageBannersResponse"],
        cache: "no-store",
        native: true
    },
    pageBannersSave: {
        id: "pageBannersSave",
        method: "post",
        path: "/api/v1/site/banners",
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown(),
        maxBodyBytes: 512 * 1024,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$page$2d$banners$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["PageBannersSaveResponse"],
        cache: "no-store",
        native: true
    },
    homeConfig: {
        id: "homeConfig",
        method: "get",
        path: "/api/v1/site/home",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$home$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["HomeConfigResponse"],
        cache: "no-store",
        native: true
    },
    homeConfigSave: {
        id: "homeConfigSave",
        method: "post",
        path: "/api/v1/site/home",
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown(),
        maxBodyBytes: 512 * 1024,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$home$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["HomeConfigSaveResponse"],
        cache: "no-store",
        native: true
    },
    siteTheme: {
        id: "siteTheme",
        method: "get",
        path: "/api/v1/site/theme",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$site$2d$theme$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["SiteThemeResponse"],
        cache: "no-store",
        native: true
    },
    siteThemeSave: {
        id: "siteThemeSave",
        method: "post",
        path: "/api/v1/site/theme",
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown(),
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$site$2d$theme$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["SiteThemeSaveResponse"],
        cache: "no-store",
        native: true
    },
    accountSession: {
        id: "accountSession",
        method: "get",
        path: "/api/v1/account/session",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$account$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AccountSessionResponse"],
        cache: "no-store",
        native: true
    },
    openApi: {
        id: "openApi",
        method: "get",
        path: "/api/public/openapi.json",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$looseObject$3e$__["z"].looseObject({
            openapi: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
        }).meta({
            id: "OpenApiDocument"
        }),
        cache: {
            maxAgeSeconds: 3600
        },
        native: true
    },
    pluginIndex: {
        id: "pluginIndex",
        method: "get",
        path: "/api/public/plugin",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$plugin$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["PluginIndexResponse"],
        cache: {
            maxAgeSeconds: 60
        },
        native: true
    },
    pluginExport: {
        id: "pluginExport",
        method: "get",
        path: "/api/public/plugin/export/{format}",
        auth: "public",
        params: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$plugin$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["PluginExportParams"],
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$plugin$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["PluginExportQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().meta({
            id: "PluginExport"
        }),
        cache: {
            maxAgeSeconds: 60
        },
        binary: true,
        native: true
    },
    pluginAgyPrompt: {
        id: "pluginAgyPrompt",
        method: "get",
        path: "/api/public/plugin/agy.md",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().meta({
            id: "PluginAgyPrompt"
        }),
        cache: {
            maxAgeSeconds: 60
        },
        binary: true,
        native: true
    },
    pluginArchive: {
        id: "pluginArchive",
        method: "get",
        path: "/api/public/plugin/archive.tar.gz",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().meta({
            id: "PluginArchive"
        }),
        cache: {
            maxAgeSeconds: 300
        },
        binary: true,
        native: true
    },
    pluginFile: {
        id: "pluginFile",
        method: "get",
        path: "/api/public/plugin/file",
        auth: "public",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$plugin$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["PluginFileQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().meta({
            id: "PluginFile"
        }),
        cache: {
            maxAgeSeconds: 60
        },
        binary: true,
        native: true
    },
    chat: {
        id: "chat",
        method: "post",
        path: "/api/v1/chat",
        auth: "owner",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chat$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ChatRequest"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chat$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ChatResponse"],
        cache: "no-store",
        stream: "sse",
        upstream: true,
        native: true
    },
    chatResume: {
        id: "chatResume",
        method: "get",
        path: "/api/v1/chat/streams/{streamId}",
        auth: "owner",
        params: StreamParams,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chat$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ChatResponse"],
        cache: "no-store",
        stream: "sse",
        native: true
    },
    chatCancel: {
        id: "chatCancel",
        method: "post",
        path: "/api/v1/chat/streams/{streamId}/cancel",
        auth: "owner",
        params: StreamParams,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
            ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true)
        }).meta({
            id: "CancelResponse"
        }),
        cache: "no-store",
        native: true
    },
    chatSocket: {
        id: "chatSocket",
        method: "get",
        path: "/api/v1/chat/ws",
        auth: "owner",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({}).meta({
            id: "WebSocketUpgrade"
        }),
        cache: "no-store",
        websocket: true,
        native: true
    },
    models: {
        id: "models",
        method: "get",
        path: "/api/v1/models",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chat$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ModelsResponse"],
        cache: {
            maxAgeSeconds: 10
        },
        upstream: true,
        native: true
    },
    ocr: {
        id: "ocr",
        method: "post",
        path: "/api/v1/ocr",
        auth: "owner",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chat$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["OcrRequest"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$chat$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["OcrResponse"],
        cache: "no-store",
        upstream: true,
        native: true
    },
    syncPush: {
        id: "syncPush",
        method: "post",
        path: "/api/v1/sync/conversations",
        auth: "owner",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["SyncPushBody"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["SyncPushResponse"],
        cache: "no-store",
        native: true
    },
    syncPull: {
        id: "syncPull",
        method: "get",
        path: "/api/v1/sync/conversations",
        auth: "owner",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["SyncPullQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["SyncPullResponse"],
        cache: "no-store",
        native: true
    },
    conversations: {
        id: "conversations",
        method: "get",
        path: "/api/v1/conversations",
        auth: "owner",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ConversationListResponse"],
        cache: "no-store",
        native: true
    },
    conversation: {
        id: "conversation",
        method: "get",
        path: "/api/v1/conversations/{id}",
        auth: "owner",
        params: ConversationParams,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ConversationDetail"],
        cache: "no-store",
        native: true
    },
    memoryList: {
        id: "memoryList",
        method: "get",
        path: "/api/v1/memory",
        auth: "owner",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$memory$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["MemoryListQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$memory$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["MemoryListResponse"],
        cache: "no-store",
        native: true
    },
    memoryDelete: {
        id: "memoryDelete",
        method: "post",
        path: "/api/v1/memory/{id}/delete",
        auth: "owner",
        params: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$memory$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["MemoryParams"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$memory$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["MemoryDeleteResponse"],
        cache: "no-store",
        native: true
    },
    memoryClear: {
        id: "memoryClear",
        method: "post",
        path: "/api/v1/memory/clear",
        auth: "owner",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$memory$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["MemoryClearResponse"],
        cache: "no-store",
        native: true
    },
    vfsInfo: {
        id: "vfsInfo",
        method: "get",
        path: "/api/v1/vfs",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["VfsInfoResponse"],
        cache: {
            maxAgeSeconds: 60
        },
        native: true
    },
    vfsStat: {
        id: "vfsStat",
        method: "get",
        path: "/api/v1/vfs/stat",
        auth: "public",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["VfsPathQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["VfsStatResponse"],
        cache: {
            maxAgeSeconds: 60
        },
        native: true
    },
    vfsList: {
        id: "vfsList",
        method: "get",
        path: "/api/v1/vfs/list",
        auth: "public",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["VfsPathQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["VfsListResponse"],
        cache: {
            maxAgeSeconds: 60
        },
        native: true
    },
    vfsFile: {
        id: "vfsFile",
        method: "get",
        path: "/api/v1/vfs/file",
        auth: "public",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["VfsPathQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$instanceof$3e$__["z"].instanceof(Uint8Array).meta({
            id: "Bytes"
        }),
        cache: {
            maxAgeSeconds: 86_400
        },
        binary: true,
        native: true
    },
    vfsQuery: {
        id: "vfsQuery",
        method: "post",
        path: "/api/v1/vfs/query",
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["VfsQueryBody"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$sync$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["VfsQueryResponse"],
        cache: "no-store",
        native: true
    },
    health: {
        id: "health",
        native: true,
        method: "get",
        path: "/health",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["HealthResponse"],
        cache: {
            maxAgeSeconds: 5
        }
    },
    apiHealth: {
        id: "apiHealth",
        native: true,
        method: "get",
        path: "/api/health",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["HealthResponse"],
        cache: "no-store"
    },
    publicStats: {
        id: "publicStats",
        method: "get",
        path: "/api/public/stats",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["PublicStats"],
        cache: {
            maxAgeSeconds: 15
        }
    },
    ragSearch: {
        id: "ragSearch",
        native: true,
        method: "get",
        path: "/api/public/rag/search",
        auth: "public",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["RagSearchQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["RagSearchResponse"],
        cache: {
            maxAgeSeconds: 300
        }
    },
    ragContext: {
        id: "ragContext",
        native: true,
        method: "get",
        path: "/api/public/rag/context",
        auth: "public",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["RagSearchQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["RagContextResponse"],
        cache: {
            maxAgeSeconds: 300
        }
    },
    wikiCategories: {
        id: "wikiCategories",
        native: true,
        method: "get",
        path: "/api/public/wiki/categories",
        auth: "public",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WikiCategoriesResponse"],
        cache: WIKI_CACHE
    },
    wikiList: {
        id: "wikiList",
        native: true,
        method: "get",
        path: "/api/public/wiki/{category}",
        auth: "public",
        params: WikiCategoryParams,
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WikiListQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WikiListResponse"],
        cache: WIKI_CACHE,
        paginated: true
    },
    wikiEntity: {
        id: "wikiEntity",
        native: true,
        method: "get",
        path: "/api/public/wiki/{category}/{idOrSlug}",
        auth: "public",
        params: WikiEntityParams,
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WikiEntity"],
        cache: WIKI_CACHE
    },
    lexiconList: {
        id: "lexiconList",
        native: true,
        method: "get",
        path: "/api/public/lexicon",
        auth: "public",
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$lexicon$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LexiconListQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$lexicon$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LexiconListResponse"],
        cache: {
            maxAgeSeconds: 3600
        },
        paginated: true
    },
    lexiconTerm: {
        id: "lexiconTerm",
        native: true,
        method: "get",
        path: "/api/public/lexicon/{idOrForm}",
        auth: "public",
        params: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$lexicon$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LexiconTermParams"],
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$lexicon$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LexiconTermQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$lexicon$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LexiconTerm"],
        cache: {
            maxAgeSeconds: 3600
        }
    },
    createGoal: {
        id: "createGoal",
        method: "post",
        path: "/api/admin/goals",
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["CreateGoalBody"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["CreateGoalResponse"],
        cache: "no-store"
    },
    completeGoal: {
        id: "completeGoal",
        method: "post",
        path: "/api/admin/goals/{id}/complete",
        auth: "admin",
        params: NumericIdParams,
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["CompleteGoalBody"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["CompleteGoalResponse"],
        cache: "no-store"
    },
    feedbackStatus: {
        id: "feedbackStatus",
        method: "post",
        path: "/api/training/feedback/{id}/status",
        auth: "admin",
        params: NumericIdParams,
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["FeedbackStatusBody"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["FeedbackStatusResponse"],
        cache: "no-store"
    },
    goldCase: {
        id: "goldCase",
        method: "post",
        path: "/api/training/gold",
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["GoldCaseBody"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["GoldCaseResponse"],
        cache: "no-store"
    },
    runEval: {
        id: "runEval",
        method: "post",
        path: "/api/training/eval",
        auth: "admin",
        body: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["EvalRequestBody"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["EvalResponse"],
        cache: "no-store"
    },
    adminStats: {
        id: "adminStats",
        method: "get",
        path: "/api/stats/totals",
        auth: "admin",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["BotAdminStats"],
        cache: "no-store"
    },
    adminServices: {
        id: "adminServices",
        method: "get",
        path: "/api/services",
        auth: "admin",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["BotServices"],
        cache: "no-store"
    },
    adminTables: {
        id: "adminTables",
        method: "get",
        path: "/api/database/tables",
        auth: "admin",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["BotTables"],
        cache: "no-store"
    },
    adminTableRows: {
        id: "adminTableRows",
        method: "get",
        path: "/api/database/{table}",
        auth: "admin",
        params: TableParams,
        query: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["TablePageQuery"],
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["BotTableRows"],
        cache: "no-store",
        paginated: true
    },
    adminWikiStats: {
        id: "adminWikiStats",
        method: "get",
        path: "/api/wiki/stats",
        auth: "admin",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["BotWikiStats"],
        cache: "no-store"
    },
    adminEconomyStats: {
        id: "adminEconomyStats",
        method: "get",
        path: "/api/economy/stats",
        auth: "admin",
        response: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$api$2f$src$2f$contract$2f$schemas$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["BotEconomyStats"],
        cache: "no-store"
    }
};
const ENDPOINTS = Object.values(endpoints);
const LEGACY_PUBLIC_PATHS = [
    "/health",
    "/health/check",
    "/health/latency",
    "/api/health",
    "/api/openapi.json",
    "/api/public/assets",
    "/api/public/commands",
    "/api/public/data/coverage",
    "/api/public/economy/inflation",
    "/api/public/eval/cache-stats",
    "/api/public/eval/lore-stats",
    "/api/public/eval/reports",
    "/api/public/leaderboard",
    "/api/public/manga/color/{channelId}/{attachmentId}/{file}",
    "/api/public/manga/couleur/{channelId}/{attachmentId}/{file}",
    "/api/public/manga/page/{series}/{volume}/{page}",
    "/api/public/manga/search",
    "/api/public/manga/tomes",
    "/api/public/manga/tomes/{series}/{volume}",
    "/api/public/news",
    "/api/public/personas",
    "/api/public/presence",
    "/api/public/profile/{discordId}/card.png",
    "/api/public/profile/{discordId}/scan.png",
    "/api/public/rag/chat",
    "/api/public/rag/context",
    "/api/public/rag/search",
    "/api/public/shop",
    "/api/public/sources",
    "/api/public/stats",
    "/api/public/user/{discordId}",
    "/api/public/wiki/arcs",
    "/api/public/wiki/arcs/{slug}",
    "/api/public/wiki/characters",
    "/api/public/wiki/characters/{id}",
    "/api/public/wiki/episodes",
    "/api/public/wiki/episodes/{id}",
    "/api/public/wiki/games",
    "/api/public/wiki/games/{slug}",
    "/api/public/wiki/manga/volumes",
    "/api/public/wiki/manga/volumes/{id}",
    "/api/public/wiki/movies",
    "/api/public/wiki/movies/{slug}",
    "/api/public/wiki/news",
    "/api/public/wiki/planets",
    "/api/public/wiki/planets/{id}",
    "/api/public/wiki/races",
    "/api/public/wiki/races/{slug}",
    "/api/public/wiki/sagas",
    "/api/public/wiki/sagas/{slug}",
    "/api/public/wiki/search",
    "/api/public/wiki/techniques",
    "/api/public/wiki/techniques/{slug}",
    "/api/public/wiki/tools",
    "/api/public/wiki/tools/{slug}",
    "/api/public/wiki/transformations",
    "/api/public/wiki/transformations/{id}"
];
function fillPath(path, params) {
    return path.replace(/\{(\w+)\}/g, (_, name)=>{
        const value = params?.[name];
        if (value === undefined || value === null || value === "") {
            throw new Error(`missing path parameter "${name}" for ${path}`);
        }
        return encodeURIComponent(String(value));
    });
}
}),
"[project]/packages/api/src/contract/error.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ApiErrorCode",
    ()=>ApiErrorCode,
    "ErrorEnvelope",
    ()=>ErrorEnvelope
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Error envelope of every Shenron HTTP API (docs/architecture/STACK.md §3.6).
 *
 * Runtime class: `pure` — plain zod with `.meta({ id })`, no hono import, so
 * a browser bundle can validate API errors without pulling the server.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
;
const ApiErrorCode = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
    "not_found",
    "invalid_request",
    "rate_limited",
    "unauthenticated",
    "forbidden",
    "pg_unavailable",
    "upstream_unavailable",
    "internal"
]).meta({
    id: "ApiErrorCode"
});
const ErrorEnvelope = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    error: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    code: ApiErrorCode.optional(),
    message: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
}).meta({
    id: "ErrorEnvelope"
});
}),
"[project]/packages/api/src/contract/favorites.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FavoriteSchema",
    ()=>FavoriteSchema,
    "FavoritesResponse",
    ()=>FavoritesResponse,
    "FavoritesSaveResponse",
    ()=>FavoritesSaveResponse
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .literal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$favorites$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/favorites.ts [middleware] (ecmascript)");
;
;
const FavoriteSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$favorites$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["FAVORITE_KINDS"]),
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).max(64),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).max(200),
    href: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().startsWith("/").max(300),
    image: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable().optional(),
    caption: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable().optional(),
    at: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().finite()
});
const FavoritesResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    favorites: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(FavoriteSchema).max(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$favorites$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["FAVORITES_MAX"])
}).meta({
    id: "FavoritesResponse"
});
const FavoritesSaveResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true),
    count: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0).max(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$favorites$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["FAVORITES_MAX"])
}).meta({
    id: "FavoritesSaveResponse"
});
}),
"[project]/packages/api/src/contract/home.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HomeConfigResponse",
    ()=>HomeConfigResponse,
    "HomeConfigSaveResponse",
    ()=>HomeConfigSaveResponse
]);
// SPDX-License-Identifier: Apache-2.0
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .record>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .unknown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .literal>");
;
const HomeConfigResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    config: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown())
}).meta({
    id: "HomeConfigResponse"
});
const HomeConfigSaveResponse = HomeConfigResponse.extend({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true)
}).meta({
    id: "HomeConfigSaveResponse"
});
}),
"[project]/packages/api/src/contract/lexicon.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LexiconKind",
    ()=>LexiconKind,
    "LexiconLang",
    ()=>LexiconLang,
    "LexiconListQuery",
    ()=>LexiconListQuery,
    "LexiconListResponse",
    ()=>LexiconListResponse,
    "LexiconTerm",
    ()=>LexiconTerm,
    "LexiconTermParams",
    ()=>LexiconTermParams,
    "LexiconTermQuery",
    ()=>LexiconTermQuery
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Trilingual lexicon (`@aphrody/shenron-lexicon`, `data/lexicon/terms.json`): list, search and the
 * localised resolution of one term. Runtime class: `pure`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/lexicon/src/types.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$lexicon$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/lexicon/src/lexicon.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .boolean>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .coerce>");
;
;
const LexiconLang = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LANGS"]).meta({
    id: "LexiconLang"
});
const LexiconKind = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["KINDS"]).meta({
    id: "LexiconKind"
});
const AliasList = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string());
const LexiconTerm = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    kind: LexiconKind,
    /** Form in the requested language; French when the English form is not established. */ label: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    labelLang: LexiconLang,
    fallback: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    ja: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    fr: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    /** `null` while no source establishes the English form. */ en: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    romaji: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    aliases: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        ja: AliasList,
        fr: AliasList,
        en: AliasList
    }),
    /** Search rank (with `q` only). */ score: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().optional()
}).meta({
    id: "LexiconTerm"
});
const LexiconListQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    lang: LexiconLang.optional(),
    kind: LexiconKind.optional(),
    q: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(200).optional(),
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$lexicon$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["SEARCH_MAX_LIMIT"]).default(20),
    offset: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(0).default(0)
}).meta({
    id: "LexiconListQuery"
});
const LexiconListResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    lang: LexiconLang,
    version: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
    items: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(LexiconTerm),
    total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0),
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
    offset: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int()
}).meta({
    id: "LexiconListResponse"
});
const LexiconTermParams = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    idOrForm: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).max(200)
});
const LexiconTermQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    lang: LexiconLang.optional()
}).meta({
    id: "LexiconTermQuery"
});
}),
"[project]/packages/api/src/contract/memory.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MemoryClearResponse",
    ()=>MemoryClearResponse,
    "MemoryDeleteResponse",
    ()=>MemoryDeleteResponse,
    "MemoryEntry",
    ()=>MemoryEntry,
    "MemoryListQuery",
    ()=>MemoryListQuery,
    "MemoryListResponse",
    ()=>MemoryListResponse,
    "MemoryParams",
    ()=>MemoryParams,
    "MemoryTag",
    ()=>MemoryTag
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Persistent chat memory of the owner: facts the chat remembered from earlier turns (Aphrody's
 * `aphrody-memory`, SQLite provider, in the server's data directory). Every route is scoped to
 * the conversation owner; the agent id behind it never leaves the server. Runtime class: `pure`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .record>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .literal>");
;
const MemoryTag = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^[a-z0-9:_-]{1,32}$/).meta({
    id: "MemoryTag"
});
const MemoryEntry = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    content: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    tags: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()),
    /** Creation time (ISO 8601, UTC). */ createdAt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    /** `source` (`chat`), `conversationId`, `persona` of the turn that wrote it. */ metadata: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string())
}).meta({
    id: "MemoryEntry"
});
const MemoryListQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    /** Substring of the content (case-insensitive on ASCII). */ q: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(200).optional(),
    tag: MemoryTag.optional(),
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(1).max(500).default(100)
}).meta({
    id: "MemoryListQuery"
});
const MemoryListResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    memories: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(MemoryEntry),
    total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int()
}).meta({
    id: "MemoryListResponse"
});
const MemoryParams = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^[A-Za-z0-9_-]{8,64}$/)
});
const MemoryDeleteResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true)
}).meta({
    id: "MemoryDeleteResponse"
});
const MemoryClearResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    deleted: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0)
}).meta({
    id: "MemoryClearResponse"
});
}),
"[project]/packages/api/src/contract/page-banners.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PageBannersResponse",
    ()=>PageBannersResponse,
    "PageBannersSaveResponse",
    ()=>PageBannersSaveResponse,
    "PageBannersSchema",
    ()=>PageBannersSchema
]);
// SPDX-License-Identifier: Apache-2.0
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .record>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .literal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$page$2d$banners$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/page-banners.ts [middleware] (ecmascript)");
;
;
const PageBannersSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    pages: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object(Object.fromEntries(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$page$2d$banners$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["PAGE_HERO_KEYS"].map((key)=>[
            key,
            __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
        ]))),
    series: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()),
    fallback: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
}).meta({
    id: "PageBanners"
});
const PageBannersResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    banners: PageBannersSchema
}).meta({
    id: "PageBannersResponse"
});
const PageBannersSaveResponse = PageBannersResponse.extend({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true)
}).meta({
    id: "PageBannersSaveResponse"
});
}),
"[project]/packages/api/src/contract/plugin.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PluginExportParams",
    ()=>PluginExportParams,
    "PluginExportQuery",
    ()=>PluginExportQuery,
    "PluginFileQuery",
    ()=>PluginFileQuery,
    "PluginFormat",
    ()=>PluginFormat,
    "PluginIndexResponse",
    ()=>PluginIndexResponse
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Plugin « shenron » servi par l'API publique : index, export complet et fichiers.
 * Runtime class: `pure`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .boolean>");
;
const PluginFormat = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
    "json",
    "md",
    "txt",
    "html"
]).meta({
    id: "PluginFormat"
});
const PluginEntrySchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "skill",
        "agent"
    ]),
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    description: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
});
const PluginIndexResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    version: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    description: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    sha256: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    loadedAt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    usage: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    formats: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        json: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        md: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        txt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        html: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    }),
    /** Gzipped tarball of the plugin, rooted at `shenron/` (`agy plugin install`). */ archive: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    /** Install commands per agent CLI. */ install: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        claude: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        agy: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        /** One prompt that makes agy install and configure everything (Aphrody, plugin, MCP, agent home). */ agyPrompt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        /** `agy -i "$(curl …agy.md)"`. */ agyFull: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    }),
    skills: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(PluginEntrySchema),
    agents: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(PluginEntrySchema),
    files: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        bytes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().nonnegative(),
        sha256: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        contentType: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    }))
}).meta({
    id: "PluginIndexResponse"
});
const PluginExportParams = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    format: PluginFormat
});
const PluginExportQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    full: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional()
});
const PluginFileQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).max(300),
    format: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "raw",
        "json",
        "md",
        "txt",
        "html"
    ]).optional()
});
}),
"[project]/packages/api/src/contract/schemas.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BotAdminStats",
    ()=>BotAdminStats,
    "BotEconomyStats",
    ()=>BotEconomyStats,
    "BotServices",
    ()=>BotServices,
    "BotTableRows",
    ()=>BotTableRows,
    "BotTables",
    ()=>BotTables,
    "BotWikiStats",
    ()=>BotWikiStats,
    "CompleteGoalBody",
    ()=>CompleteGoalBody,
    "CompleteGoalResponse",
    ()=>CompleteGoalResponse,
    "CreateGoalBody",
    ()=>CreateGoalBody,
    "CreateGoalResponse",
    ()=>CreateGoalResponse,
    "EvalRequestBody",
    ()=>EvalRequestBody,
    "EvalResponse",
    ()=>EvalResponse,
    "FeedbackStatus",
    ()=>FeedbackStatus,
    "FeedbackStatusBody",
    ()=>FeedbackStatusBody,
    "FeedbackStatusResponse",
    ()=>FeedbackStatusResponse,
    "GoalPriority",
    ()=>GoalPriority,
    "GoldCaseBody",
    ()=>GoldCaseBody,
    "GoldCaseResponse",
    ()=>GoldCaseResponse,
    "HealthResponse",
    ()=>HealthResponse,
    "PublicStats",
    ()=>PublicStats,
    "RagContextResponse",
    ()=>RagContextResponse,
    "RagContextSource",
    ()=>RagContextSource,
    "RagHit",
    ()=>RagHit,
    "RagMode",
    ()=>RagMode,
    "RagSearchQuery",
    ()=>RagSearchQuery,
    "RagSearchResponse",
    ()=>RagSearchResponse,
    "TablePage",
    ()=>TablePage,
    "TablePageQuery",
    ()=>TablePageQuery,
    "WIKI_LIST_DEFAULT_LIMIT",
    ()=>WIKI_LIST_DEFAULT_LIMIT,
    "WIKI_LIST_MAX_LIMIT",
    ()=>WIKI_LIST_MAX_LIMIT,
    "WikiCategoriesResponse",
    ()=>WikiCategoriesResponse,
    "WikiCategoryName",
    ()=>WikiCategoryName,
    "WikiCategorySummary",
    ()=>WikiCategorySummary,
    "WikiEntity",
    ()=>WikiEntity,
    "WikiListQuery",
    ()=>WikiListQuery,
    "WikiListResponse",
    ()=>WikiListResponse
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Response and request schemas of the Shenron HTTP contract (docs/architecture/STACK.md §3.6).
 *
 * Runtime class: `pure` — only `zod` and `@aphrody/shenron-db/constants`. Every
 * response schema carries `.meta({ id })`, which the OpenAPI generator turns
 * into a named component. Shapes mirror the current bot handlers
 * (`apps/bot/src/api/server.ts`, `apps/bot/src/api/ia-cockpit.ts`).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/constants.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .coerce>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .record>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .unknown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$looseObject$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .looseObject>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .boolean>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .literal>");
;
;
const HealthResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    status: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal("ok")
}).meta({
    id: "HealthResponse"
});
const PublicStats = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    users: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    totalXp: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    totalZeni: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    achievementsUnlocked: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    shopItems: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    inventoryItems: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
}).meta({
    id: "PublicStats"
});
const RagMode = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
    "hybrid+rerank",
    "hybrid",
    "lexical"
]).meta({
    id: "RagMode"
});
const RagSearchQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    q: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(500),
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(1).max(25).optional(),
    maxChars: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(500).max(16_000).optional(),
    lang: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(8).optional(),
    entity: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(200).optional(),
    sourceId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(200).optional(),
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(100).optional(),
    lexicalOnly: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean().optional()
}).meta({
    id: "RagSearchQuery"
});
const RagHit = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    rowid: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    snippet: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    score: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    sourceId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    lang: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    content: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
}).meta({
    id: "RagHit"
});
const RagSearchResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    q: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    results: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(RagHit),
    mode: RagMode.optional(),
    error: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
}).meta({
    id: "RagSearchResponse"
});
const RagContextSource = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    n: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    rowid: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    sourceId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    lang: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    score: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
}).meta({
    id: "RagContextSource"
});
const RagContextResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    q: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    mode: RagMode,
    context: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    sources: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(RagContextSource),
    error: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
}).meta({
    id: "RagContextResponse"
});
// ── IA cockpit (admin writes, ia-cockpit.ts limits) ─────────────────────────
const trimmed = (max)=>__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1).max(max);
const GoalPriority = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["GOAL_PRIORITIES"]).meta({
    id: "GoalPriority"
});
const FeedbackStatus = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["FEEDBACK_STATUSES"]).meta({
    id: "FeedbackStatus"
});
const CreateGoalBody = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    title: trimmed(200),
    description: trimmed(4000).optional(),
    userId: trimmed(64),
    userTag: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(100).optional(),
    priority: GoalPriority.optional(),
    targetSession: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(64).optional()
}).meta({
    id: "CreateGoalBody"
});
const CompleteGoalBody = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    notes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(4000).nullable().optional()
}).meta({
    id: "CompleteGoalBody"
});
const FeedbackStatusBody = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    status: FeedbackStatus
}).meta({
    id: "FeedbackStatusBody"
});
const GoldCaseBody = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    q: trimmed(500),
    expect: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(trimmed(300)).min(1),
    userId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(64).optional(),
    userTag: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().max(100).optional()
}).meta({
    id: "GoldCaseBody"
});
const EvalRequestBody = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    samples: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0).max(1000).optional()
}).meta({
    id: "EvalRequestBody"
});
const CreateGoalResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true),
    goal: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown())
}).meta({
    id: "CreateGoalResponse"
});
const CompleteGoalResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true),
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
}).meta({
    id: "CompleteGoalResponse"
});
const FeedbackStatusResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true),
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    status: FeedbackStatus
}).meta({
    id: "FeedbackStatusResponse"
});
const GoldCaseResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true),
    q: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    expect: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string())
}).meta({
    id: "GoldCaseResponse"
});
const EvalResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true),
    metrics: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$looseObject$3e$__["z"].looseObject({
        cases: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
    }),
    persisted: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    persistError: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable()
}).meta({
    id: "EvalResponse"
});
function TablePage(row) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        rows: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(row),
        total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        offset: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
    });
}
const TablePageQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(1).max(500).optional(),
    offset: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0).optional()
}).meta({
    id: "TablePageQuery"
});
// ── Wiki (PostgreSQL, B14) ──────────────────────────────────────────────────
const categoryNames = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WIKI_CATEGORIES"].map((c)=>c.name);
const WikiCategoryName = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum(categoryNames).meta({
    id: "WikiCategoryName"
});
const WikiCategorySummary = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    name: WikiCategoryName,
    label: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0)
}).meta({
    id: "WikiCategorySummary"
});
const WikiCategoriesResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    categories: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(WikiCategorySummary)
}).meta({
    id: "WikiCategoriesResponse"
});
const WIKI_LIST_DEFAULT_LIMIT = 50;
const WIKI_LIST_MAX_LIMIT = 200;
const WikiListQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(WIKI_LIST_MAX_LIMIT).default(WIKI_LIST_DEFAULT_LIMIT),
    offset: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(0).default(0),
    q: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(200).optional()
}).meta({
    id: "WikiListQuery"
});
const WikiEntity = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown()).meta({
    id: "WikiEntity"
});
const WikiListResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    category: WikiCategoryName,
    items: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(WikiEntity),
    total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().min(0),
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
    offset: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int()
}).meta({
    id: "WikiListResponse"
});
const BotAdminStats = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    stats: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$looseObject$3e$__["z"].looseObject({
        totalUsers: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        totalGuilds: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        totalActiveUsers: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        totalCommands: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
    })
}).meta({
    id: "BotAdminStats"
});
const BotServices = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    actions: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        service: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        action: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        description: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    }))
}).meta({
    id: "BotServices"
});
const BotTables = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    tables: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        pk: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        readonly: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
        mutableColumns: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()),
        description: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable()
    }))
}).meta({
    id: "BotTables"
});
const BotTableRows = TablePage(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown())).meta({
    id: "BotTableRows"
});
const BotWikiStats = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    counts: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()),
    isSeeded: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean()
}).meta({
    id: "BotWikiStats"
});
const BotEconomyStats = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    zeni: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        avg: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        max: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        users: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        rich: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        zero: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
    }),
    fusions: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    inventoryItems: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    shopItemsActive: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
}).meta({
    id: "BotEconomyStats"
});
}),
"[project]/packages/api/src/contract/site-theme.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SiteThemeResponse",
    ()=>SiteThemeResponse,
    "SiteThemeSaveResponse",
    ()=>SiteThemeSaveResponse,
    "SiteThemeSchema",
    ()=>SiteThemeSchema
]);
// SPDX-License-Identifier: Apache-2.0
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .literal>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$site$2d$theme$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/site-theme.ts [middleware] (ecmascript)");
;
;
const color = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^#(?:[\da-fA-F]{3}|[\da-fA-F]{6}|[\da-fA-F]{8})$/);
const SiteThemeSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    version: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(1),
    colors: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object(Object.fromEntries(Object.keys(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$site$2d$theme$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["THEME_COLOR_VARS"]).map((key)=>[
            key,
            color
        ]))),
    radius: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().min(0).max(2)
}).meta({
    id: "SiteTheme"
});
const SiteThemeResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    theme: SiteThemeSchema
}).meta({
    id: "SiteThemeResponse"
});
const SiteThemeSaveResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true),
    theme: SiteThemeSchema
}).meta({
    id: "SiteThemeSaveResponse"
});
}),
"[project]/packages/api/src/contract/sync.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ConversationDetail",
    ()=>ConversationDetail,
    "ConversationListResponse",
    ()=>ConversationListResponse,
    "ConversationRecord",
    ()=>ConversationRecord,
    "MessageRecord",
    ()=>MessageRecord,
    "StoredCitation",
    ()=>StoredCitation,
    "SyncPullQuery",
    ()=>SyncPullQuery,
    "SyncPullResponse",
    ()=>SyncPullResponse,
    "SyncPushBody",
    ()=>SyncPushBody,
    "SyncPushResponse",
    ()=>SyncPushResponse,
    "VfsInfoResponse",
    ()=>VfsInfoResponse,
    "VfsListResponse",
    ()=>VfsListResponse,
    "VfsPathQuery",
    ()=>VfsPathQuery,
    "VfsQueryBody",
    ()=>VfsQueryBody,
    "VfsQueryResponse",
    ()=>VfsQueryResponse,
    "VfsStatResponse",
    ()=>VfsStatResponse
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Conversation sync and VFS contracts (zod mirrors of `@aphrody/shenron-db/conversations/types`).
 * Runtime class: `pure`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .boolean>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .record>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .unknown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .coerce>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$union$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .union>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$null$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .null>");
;
const Id = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().regex(/^[A-Za-z0-9_:-]{8,64}$/);
const Iso = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().datetime({
    offset: true
});
const StoredCitation = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    n: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    source: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    snippet: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
}).meta({
    id: "StoredCitation"
});
const ConversationRecord = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: Id,
    surface: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "site",
        "desktop",
        "bot"
    ]),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(200).nullable(),
    persona: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(64).nullable(),
    createdAt: Iso,
    updatedAt: Iso,
    deletedAt: Iso.nullable(),
    memoryOptIn: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    ragOptIn: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
    metadata: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown())
}).meta({
    id: "ConversationRecord"
});
const MessageRecord = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: Id,
    conversationId: Id,
    role: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "user",
        "assistant",
        "system",
        "tool"
    ]),
    content: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(64_000),
    citations: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(StoredCitation).max(32),
    model: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(128).nullable(),
    createdAt: Iso,
    updatedAt: Iso,
    deletedAt: Iso.nullable()
}).meta({
    id: "MessageRecord"
});
const SyncPushBody = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    deviceId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(80).optional(),
    conversations: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown()).max(500).default([]),
    messages: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown()).max(500).default([])
}).meta({
    id: "SyncPushBody"
});
const SyncPushResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    accepted: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()),
    duplicates: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        canonicalId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    })),
    conflicts: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        server: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown())
    })),
    rejected: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        reason: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
    })),
    cursor: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()
}).meta({
    id: "SyncPushResponse"
});
const SyncPullQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    cursor: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().max(16).optional(),
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$coerce$3e$__["z"].coerce.number().int().min(1).max(1000).optional()
}).meta({
    id: "SyncPullQuery"
});
const SyncPullResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    conversations: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(ConversationRecord),
    messages: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(MessageRecord),
    cursor: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    hasMore: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean()
}).meta({
    id: "SyncPullResponse"
});
const ConversationListResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    conversations: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(ConversationRecord)
}).meta({
    id: "ConversationListResponse"
});
const ConversationDetail = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    conversation: ConversationRecord,
    messages: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(MessageRecord)
}).meta({
    id: "ConversationDetail"
});
const VfsPathQuery = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).max(4096)
}).meta({
    id: "VfsPathQuery"
});
const VfsStatResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "file",
        "dir"
    ]),
    size: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
    sha256: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    mime: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    storage: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "inline",
        "embedded",
        "cdn"
    ]),
    sourceUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    visibility: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "public",
        "private"
    ])
}).meta({
    id: "VfsStatResponse"
});
const VfsListResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    entries: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        kind: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
            "file",
            "dir"
        ]),
        size: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
        storage: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
            "inline",
            "embedded",
            "cdn"
        ])
    }))
}).meta({
    id: "VfsListResponse"
});
const VfsQueryBody = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    sql: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1).max(10_000),
    params: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$union$3e$__["z"].union([
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$boolean$3e$__["z"].boolean(),
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$null$3e$__["z"].null()
    ])).max(50).default([])
}).meta({
    id: "VfsQueryBody"
});
const VfsQueryResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    rows: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown())),
    ms: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
}).meta({
    id: "VfsQueryResponse"
});
const VfsInfoResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    profile: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    schemaVersion: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    generatedAt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
    files: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
    dirs: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
    bytes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()),
    counts: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()),
    rag: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        docs: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
        chunks: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
        vectorsF32: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
        vectorsI8: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int(),
        model: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().nullable(),
        kinds: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number())
    }),
    wiki: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int()
}).meta({
    id: "VfsInfoResponse"
});
}),
"[project]/packages/api/src/contract/web.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/** Finite native Web operations; admin authority is enforced by the existing API router. */ __turbopack_context__.s([
    "WebFrameMatches",
    ()=>WebFrameMatches,
    "WebFrameStats",
    ()=>WebFrameStats,
    "WebFrameVector",
    ()=>WebFrameVector,
    "WebMediaResults",
    ()=>WebMediaResults,
    "WebMediaSource",
    ()=>WebMediaSource,
    "WebStatus",
    ()=>WebStatus
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/pipeline/src/bxc/contracts.ts [middleware] (ecmascript)");
;
;
const WebStatus = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WebStatus"].meta({
    id: "WebStatus"
});
const WebMediaSource = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WebMediaSource"].meta({
    id: "WebMediaSource"
});
const WebMediaResults = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["WebMediaResults"].meta({
    id: "WebMediaResults"
});
const WebFrameStats = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["BxcFramesStatsSchema"].meta({
    id: "WebFrameStats"
});
const WebFrameVector = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["BxcVectorOutputSchema"].meta({
    id: "WebFrameVector"
});
const WebFrameMatches = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$pipeline$2f$src$2f$bxc$2f$contracts$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["BxcSearchOutputSchema"].meta({
    id: "WebFrameMatches"
});
}),
"[project]/packages/api/src/contract/wiki-launch.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LaunchConfigResponse",
    ()=>LaunchConfigResponse,
    "LaunchConfigSaveResponse",
    ()=>LaunchConfigSaveResponse,
    "LaunchConfigSchema",
    ()=>LaunchConfigSchema,
    "LaunchPatchSchema",
    ()=>LaunchPatchSchema
]);
// SPDX-License-Identifier: Apache-2.0
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .record>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .unknown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .literal>");
;
const LaunchConfigSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    openKeys: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()),
    order: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()),
    access: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        mode: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
            "public",
            "members",
            "roles",
            "admin"
        ]),
        roleIds: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string())
    }))
}).meta({
    id: "LaunchConfig"
});
const LaunchPatchSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    openKeys: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown()).optional(),
    order: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown()).optional(),
    access: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown()).optional()
}).refine((patch)=>Object.keys(patch).length > 0, "At least one launch field is required").meta({
    id: "LaunchPatch"
});
const LaunchConfigResponse = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    config: LaunchConfigSchema
}).meta({
    id: "LaunchConfigResponse"
});
const LaunchConfigSaveResponse = LaunchConfigResponse.extend({
    ok: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$literal$3e$__["z"].literal(true)
}).meta({
    id: "LaunchConfigSaveResponse"
});
}),
"[project]/packages/auth/src/acting-user.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ACTING_USER_HEADERS",
    ()=>ACTING_USER_HEADERS,
    "ACTING_USER_SKEW_MS",
    ()=>ACTING_USER_SKEW_MS,
    "ACTING_USER_TEST_VECTOR",
    ()=>ACTING_USER_TEST_VECTOR,
    "signActingUser",
    ()=>signActingUser,
    "verifyActingUser",
    ()=>verifyActingUser
]);
/**
 * `x-acting-*` protocol between the site proxy `/api/bot-user/*` and the bot
 * (runtime class `server`).
 *
 * Signer (site, `app/api/bot-user/[...path]/route.ts`): `ts = String(Date.now())`,
 * `sig = hex(HMAC-SHA256(secret, discordId + ":" + ts))`.
 * Verifier (bot, `api/user-auth.ts`): snowflake `/^\d{17,20}$/`, finite `ts`
 * within ±5 minutes, constant-time compare with the lower-cased signature.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/crypto.ts [middleware] (ecmascript)");
;
const ACTING_USER_HEADERS = Object.freeze({
    user: "x-acting-user",
    ts: "x-acting-ts",
    sig: "x-acting-sig"
});
const ACTING_USER_SKEW_MS = 5 * 60 * 1000;
const SNOWFLAKE = /^\d{17,20}$/;
function signActingUser(options) {
    const ts = String(options.nowMs ?? Date.now());
    const sig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["hmacSha256Hex"])(options.secret, `${options.discordId}:${ts}`);
    return {
        [ACTING_USER_HEADERS.user]: options.discordId,
        [ACTING_USER_HEADERS.ts]: ts,
        [ACTING_USER_HEADERS.sig]: sig
    };
}
function verifyActingUser(headers, options) {
    const secret = options.secret;
    if (!secret) return {
        ok: false,
        code: "not_configured"
    };
    const discordId = headers.get(ACTING_USER_HEADERS.user);
    const tsRaw = headers.get(ACTING_USER_HEADERS.ts);
    const sig = headers.get(ACTING_USER_HEADERS.sig);
    if (!discordId || !tsRaw || !sig) return {
        ok: false,
        code: "missing"
    };
    if (!SNOWFLAKE.test(discordId)) return {
        ok: false,
        code: "bad_id"
    };
    const ts = Number(tsRaw);
    const now = options.nowMs ?? Date.now();
    if (!Number.isFinite(ts) || Math.abs(now - ts) > (options.skewMs ?? ACTING_USER_SKEW_MS)) {
        return {
            ok: false,
            code: "skew"
        };
    }
    // Same message as the bot: the timestamp goes through `Number` then back to a string.
    const expected = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["hmacSha256Hex"])(secret, `${discordId}:${ts}`);
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["timingSafeEqualString"])(expected, sig.toLowerCase())) return {
        ok: false,
        code: "bad_sig"
    };
    return {
        ok: true,
        discordId
    };
}
const ACTING_USER_TEST_VECTOR = Object.freeze({
    secret: "shenron-acting-user-test-vector-secret",
    discordId: "123456789012345678",
    ts: "1767225600000",
    sig: "b20f28b31e976481054b059cb61f1a00f660192f726354e963a7d6eb47228cc6"
});
}),
"[project]/packages/auth/src/agent-keys.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AGENT_TOKEN_MIN_LENGTH",
    ()=>AGENT_TOKEN_MIN_LENGTH,
    "AGENT_TOKEN_PREFIX",
    ()=>AGENT_TOKEN_PREFIX,
    "DEFAULT_AGENT_RATE_LIMIT",
    ()=>DEFAULT_AGENT_RATE_LIMIT,
    "decideWriteQuota",
    ()=>decideWriteQuota,
    "generateAgentToken",
    ()=>generateAgentToken,
    "hasScope",
    ()=>hasScope,
    "hashAgentToken",
    ()=>hashAgentToken,
    "isQuotaExemptMethod",
    ()=>isQuotaExemptMethod,
    "looksLikeAgentToken",
    ()=>looksLikeAgentToken,
    "parseScopes",
    ()=>parseScopes
]);
/**
 * Agent API keys: format, hashing, scopes and write quota (runtime class `server`).
 *
 * Same format as `apps/site/src/lib/agent-keys.ts`: `dbfr_agent_` + 32 random
 * bytes in base64url; only the SHA-256 hex of the full token is stored; the
 * display prefix is the first `prefix + 6` characters.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/crypto.ts [middleware] (ecmascript)");
;
const AGENT_TOKEN_PREFIX = "dbfr_agent_";
const AGENT_TOKEN_MIN_LENGTH = AGENT_TOKEN_PREFIX.length + 20;
const DEFAULT_AGENT_RATE_LIMIT = 120;
function hashAgentToken(token) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["sha256Hex"])(token);
}
function generateAgentToken() {
    const token = `${AGENT_TOKEN_PREFIX}${(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["randomTokenBase64Url"])(32)}`;
    return {
        token,
        hash: hashAgentToken(token),
        displayPrefix: token.slice(0, AGENT_TOKEN_PREFIX.length + 6)
    };
}
function looksLikeAgentToken(token) {
    return token.startsWith(AGENT_TOKEN_PREFIX) && token.length >= AGENT_TOKEN_MIN_LENGTH;
}
function parseScopes(vocabulary, raw) {
    if (!Array.isArray(raw)) return null;
    const known = new Set(vocabulary);
    const out = [];
    for (const value of raw){
        if (typeof value === "string" && known.has(value) && !out.includes(value)) {
            out.push(value);
        }
    }
    return out;
}
function hasScope(scopes, needed) {
    return scopes.includes(needed);
}
function isQuotaExemptMethod(method) {
    const upper = method.toUpperCase();
    return upper === "GET" || upper === "HEAD";
}
function decideWriteQuota(input) {
    if (isQuotaExemptMethod(input.method)) return {
        allowed: true
    };
    if (input.writesLastHour >= input.limit) return {
        allowed: false,
        retryAfterSeconds: 3600
    };
    return {
        allowed: true
    };
}
}),
"[project]/packages/auth/src/crypto.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "hmacSha256Hex",
    ()=>hmacSha256Hex,
    "parseBearer",
    ()=>parseBearer,
    "randomTokenBase64Url",
    ()=>randomTokenBase64Url,
    "sha256Hex",
    ()=>sha256Hex,
    "timingSafeEqualString",
    ()=>timingSafeEqualString
]);
/**
 * Synchronous crypto primitives shared by every guard (runtime class `server`).
 *
 * Replaces the hand-rolled constant-time comparisons and Bearer parsers of the
 * site (`admin-token.ts`, `api-token.ts`, `agent-keys.ts`) and the bot
 * (`api/auth.ts`, `api/user-auth.ts`). `node:crypto` only: no `Bun.*` global.
 */ var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
;
function timingSafeEqualString(a, b) {
    const ha = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["createHash"])("sha256").update(a, "utf8").digest();
    const hb = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["createHash"])("sha256").update(b, "utf8").digest();
    // The hash comparison is constant time; the final equality check guards the
    // (astronomically unlikely) collision case without adding a timing channel.
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["timingSafeEqual"])(ha, hb) && a.length === b.length;
}
function parseBearer(headers, options = {}) {
    const header = headers.get("authorization");
    if (header === null) return null;
    if (options.caseSensitive) {
        return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    }
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    const value = match?.[1]?.trim();
    return value ? value : null;
}
function sha256Hex(input) {
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["createHash"])("sha256").update(input, "utf8").digest("hex");
}
function hmacSha256Hex(secret, message) {
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["createHmac"])("sha256", secret).update(message, "utf8").digest("hex");
}
function randomTokenBase64Url(bytes = 32) {
    return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["randomBytes"])(bytes).toString("base64url");
}
}),
"[project]/packages/auth/src/guards.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "actingUserStrategy",
    ()=>actingUserStrategy,
    "adminCookieStrategy",
    ()=>adminCookieStrategy,
    "agentKeyStrategy",
    ()=>agentKeyStrategy,
    "assertSameOrigin",
    ()=>assertSameOrigin,
    "authorize",
    ()=>authorize,
    "legacySessionStrategy",
    ()=>legacySessionStrategy,
    "readCookie",
    ()=>readCookie,
    "requireScope",
    ()=>requireScope,
    "sessionStrategy",
    ()=>sessionStrategy,
    "staticBearerStrategy",
    ()=>staticBearerStrategy
]);
/**
 * Framework-agnostic guards returning a principal (runtime class `server`).
 *
 * A {@link Strategy} inspects a `Request` and returns a decision, or `null`
 * when it does not apply (the next strategy runs). {@link authorize} returns
 * the first decision, or 401 `unauthenticated` when none applies. Strategy
 * order therefore encodes precedence: the bot `checkAdmin` is
 * `[staticBearer(final, 503 when unset, exact prefix), session(requireStaff), legacySession]`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/agent-keys.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$acting$2d$user$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/acting-user.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/crypto.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$tokens$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/tokens.ts [middleware] (ecmascript)");
;
;
;
;
const allow = (principal)=>({
        ok: true,
        principal
    });
const deny = (status, code)=>({
        ok: false,
        status,
        code
    });
async function authorize(request, strategies) {
    for (const strategy of strategies){
        const decision = await strategy(request);
        if (decision) return decision;
    }
    return deny(401, "unauthenticated");
}
function staticBearerStrategy(options) {
    return async (request)=>{
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$tokens$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["verifyStaticBearer"])(request.headers, options.tokens(), {
            caseSensitive: options.caseSensitive,
            minLength: options.minLength
        });
        switch(result){
            case "not_configured":
                return options.unsetIs503 ? deny(503, "not_configured") : null;
            case "absent":
                return null;
            case "valid":
                return allow(options.as);
            case "invalid":
                return options.wrongBearerIsFinal ? deny(401, "invalid_token") : null;
        }
    };
}
function readCookie(headers, name) {
    const header = headers.get("cookie");
    if (!header) return null;
    for (const part of header.split(";")){
        const eq = part.indexOf("=");
        if (eq < 0) continue;
        if (part.slice(0, eq).trim() !== name) continue;
        const raw = part.slice(eq + 1).trim();
        try {
            return decodeURIComponent(raw);
        } catch  {
            return raw;
        }
    }
    return null;
}
function adminCookieStrategy(options) {
    return async (request)=>{
        const codec = options.codec();
        if (!codec) return null;
        const value = readCookie(request.headers, options.cookieName ?? __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$tokens$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ADMIN_COOKIE"]);
        if (!value) return null;
        return codec.verify(value, options.now?.()) ? allow({
            kind: "admin-token",
            via: "admin-cookie"
        }) : null;
    };
}
function sessionStrategy(options) {
    return async (request)=>{
        let session = null;
        try {
            session = await options.getSession(request.headers);
        } catch  {
            session = null;
        }
        if (!session?.user) return null;
        const userId = session.user.id;
        let discordId = null;
        try {
            discordId = await options.accounts.discordIdForUser(userId);
        } catch  {
            // Fail closed: without a readable Discord account there is no staff access.
            discordId = null;
        }
        const staff = options.staff.isStaff(discordId);
        if (options.requireStaff && !staff) return deny(403, "forbidden");
        return allow({
            kind: "user",
            userId,
            discordId,
            staff,
            via: "better-auth"
        });
    };
}
function legacySessionStrategy(options) {
    return async (request)=>{
        const session = await options.verify(request);
        if (!session) return null;
        if (session.source === "token") return allow({
            kind: "admin-token",
            via: "legacy-session"
        });
        const discordId = session.userId ?? null;
        if (discordId === null || !options.staff.isStaff(discordId)) return deny(403, "forbidden");
        return allow({
            kind: "user",
            userId: discordId,
            discordId,
            staff: true,
            via: "legacy-session"
        });
    };
}
function actingUserStrategy(options) {
    return async (request)=>{
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$acting$2d$user$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["verifyActingUser"])(request.headers, {
            secret: options.secret(),
            nowMs: options.now?.()
        });
        if (result.ok) return allow({
            kind: "acting-user",
            discordId: result.discordId
        });
        if (result.code === "missing" || result.code === "not_configured") return null;
        return deny(401, "invalid_token");
    };
}
function agentKeyStrategy(options) {
    return async (request)=>{
        const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["parseBearer"])(request.headers);
        if (!token?.startsWith(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AGENT_TOKEN_PREFIX"])) return null;
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["looksLikeAgentToken"])(token)) return deny(401, "invalid_token");
        const hash = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["hashAgentToken"])(token);
        const record = await options.store.findActiveByHash(hash);
        if (!record || record.revokedAt) return deny(401, "invalid_token");
        const now = options.now?.() ?? new Date();
        // `lastUsedAt` is an operational trace: a failed write never fails the call.
        options.store.touch(record.id, now).catch(()=>{});
        return allow({
            kind: "agent",
            keyId: record.id,
            name: record.name,
            scopes: record.scopes,
            rateLimit: record.rateLimit
        });
    };
}
function requireScope(decision, scope) {
    if (!decision.ok || decision.principal.kind !== "agent") return decision;
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$agent$2d$keys$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["hasScope"])(decision.principal.scopes, scope) ? decision : deny(403, "scope_missing");
}
function assertSameOrigin(request, allowedOrigins) {
    const origin = request.headers.get("origin");
    if (!origin) return null;
    const normalized = origin.replace(/\/+$/, "");
    if (normalized === new URL(request.url).origin) return null;
    if (allowedOrigins.some((allowed)=>allowed.replace(/\/+$/, "") === normalized)) return null;
    return deny(403, "cross_origin");
}
}),
"[project]/packages/auth/src/index.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AUTH_BASE_PATH",
    ()=>AUTH_BASE_PATH,
    "SHENRON_ALLOWED_HOSTS",
    ()=>SHENRON_ALLOWED_HOSTS,
    "SHENRON_CANONICAL_URL",
    ()=>SHENRON_CANONICAL_URL,
    "SHENRON_TRUSTED_ORIGINS",
    ()=>SHENRON_TRUSTED_ORIGINS,
    "getSessionSafe",
    ()=>getSessionSafe,
    "handleAuthRequest",
    ()=>handleAuthRequest,
    "mapDiscordProfileEmail",
    ()=>mapDiscordProfileEmail,
    "normalizeBaseUrl",
    ()=>normalizeBaseUrl,
    "resolveBetterAuthSecret",
    ()=>resolveBetterAuthSecret,
    "sharedAdvancedOptions",
    ()=>sharedAdvancedOptions
]);
/**
 * Framework-agnostic Better Auth building blocks shared by the Next site, the
 * Bun bot and the standalone API. Each app keeps its own `betterAuth()` call
 * (adapter, hooks, provider scopes differ); only invariants live here.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$origins$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/origins.ts [middleware] (ecmascript)");
;
;
const SHENRON_TRUSTED_ORIGINS = Object.freeze((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$origins$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["botTrustedOrigins"])({
    production: true
}));
const SHENRON_ALLOWED_HOSTS = Object.freeze((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$origins$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["siteAllowedHosts"])({
    production: true
}));
const SHENRON_CANONICAL_URL = "https://dragonballfr.com";
const AUTH_BASE_PATH = "/api/auth";
function normalizeBaseUrl(raw, fallback = SHENRON_CANONICAL_URL) {
    return (raw?.trim() || fallback).replace(/\/+$/, "");
}
function resolveBetterAuthSecret(source, randomSecret = ()=>crypto.randomUUID() + crypto.randomUUID()) {
    const isProduction = source.NODE_ENV === "production";
    for (const key of [
        "BETTER_AUTH_SECRET",
        "SESSION_SECRET"
    ]){
        const value = source[key]?.trim();
        if (!value) continue;
        if (value.length < 32) {
            throw new Error(`${key} must be at least 32 characters long.`);
        }
        return {
            secret: value,
            origin: "env"
        };
    }
    if (isProduction) {
        throw new Error("Better Auth: BETTER_AUTH_SECRET (or SESSION_SECRET) is required in production.");
    }
    const devSecret = source.BETTER_AUTH_DEV_SECRET?.trim();
    if (devSecret) return {
        secret: devSecret,
        origin: "dev"
    };
    return {
        secret: randomSecret(),
        origin: "ephemeral"
    };
}
function sharedAdvancedOptions(nodeEnv, cookiePrefix) {
    return {
        useSecureCookies: nodeEnv === "production",
        crossSubDomainCookies: {
            enabled: false
        },
        ...cookiePrefix ? {
            cookiePrefix
        } : {},
        ipAddress: {
            ipAddressHeaders: [
                "x-real-ip",
                "x-forwarded-for"
            ],
            trustedProxies: [
                "127.0.0.1",
                "::1"
            ]
        }
    };
}
function mapDiscordProfileEmail(profile) {
    return {
        email: profile.email ?? `${profile.id}@discord.placeholder.local`
    };
}
async function handleAuthRequest(auth, request, basePath = AUTH_BASE_PATH) {
    const { pathname } = new URL(request.url);
    if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return null;
    return auth.handler(request);
}
async function getSessionSafe(auth, headers) {
    try {
        return await auth.api.getSession({
            headers
        }) ?? null;
    } catch  {
        return null;
    }
}
}),
"[project]/packages/auth/src/origins.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Host and origin policy of each application (S2, docs/architecture/STACK.md §2.2).
 *
 * Runtime class `pure`: no platform import, no environment read. The caller
 * says whether it runs in production; nothing is inferred here.
 *
 * - No generic `*.vercel.app` entry: a wildcard trusted host lets any Vercel
 *   deployment act as the site (open redirect through Better Auth callbacks).
 * - The named Vercel production alias stays until INFRA-4 retires it.
 * - `localhost` entries exist only outside production.
 *
 * Every call returns a fresh array, so a consumer can never mutate the policy.
 */ __turbopack_context__.s([
    "VERCEL_PRODUCTION_ALIAS",
    ()=>VERCEL_PRODUCTION_ALIAS,
    "botTrustedOrigins",
    ()=>botTrustedOrigins,
    "siteAllowedHosts",
    ()=>siteAllowedHosts,
    "siteTrustedOrigins",
    ()=>siteTrustedOrigins
]);
const VERCEL_PRODUCTION_ALIAS = "dbfr.vercel.app";
const SITE_PRODUCTION_HOSTS = [
    "dragonballfr.com",
    "www.dragonballfr.com",
    VERCEL_PRODUCTION_ALIAS
];
const SITE_DEVELOPMENT_HOSTS = [
    "localhost:3000"
];
const SITE_PRODUCTION_ORIGINS = [
    "https://dragonballfr.com",
    "https://www.dragonballfr.com",
    `https://${VERCEL_PRODUCTION_ALIAS}`
];
const SITE_DEVELOPMENT_ORIGINS = [
    "http://localhost:3000"
];
const BOT_PRODUCTION_ORIGINS = [
    "https://dragonballfr.com",
    "https://www.dragonballfr.com",
    "https://bot.dragonballfr.com",
    `https://${VERCEL_PRODUCTION_ALIAS}`
];
const BOT_DEVELOPMENT_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5006"
];
function compose(production, development, input) {
    return input.production ? [
        ...production
    ] : [
        ...production,
        ...development
    ];
}
function siteAllowedHosts(input) {
    return compose(SITE_PRODUCTION_HOSTS, SITE_DEVELOPMENT_HOSTS, input);
}
function siteTrustedOrigins(input) {
    return compose(SITE_PRODUCTION_ORIGINS, SITE_DEVELOPMENT_ORIGINS, input);
}
function botTrustedOrigins(input) {
    return compose(BOT_PRODUCTION_ORIGINS, BOT_DEVELOPMENT_ORIGINS, input);
}
}),
"[project]/packages/auth/src/staff.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Staff policy (runtime class `pure`, decision D6 of docs/architecture/STACK.md).
 *
 * - bot scope  = OWNER_ID ∪ OWNER_IDS ∪ BOT_DEV_ID ∪ OAUTH_ALLOWED_USERS
 *   (`isBotOwner` + `isUserAllowed` of `apps/bot/src/api/oauth.ts`);
 * - site scope = OWNER_ID ∪ OAUTH_ALLOWED_USERS (`apps/site/src/lib/session.ts`).
 *
 * The environment is injected: nothing is read at module load.
 */ /** Structural environment source (same shape as `@aphrody/shenron-config/env` `EnvSource`). */ __turbopack_context__.s([
    "createStaffPolicy",
    ()=>createStaffPolicy,
    "parseSnowflakeCsv",
    ()=>parseSnowflakeCsv,
    "staffPolicyFromEnv",
    ()=>staffPolicyFromEnv
]);
const SNOWFLAKE = /^\d{17,20}$/;
function parseSnowflakeCsv(raw) {
    if (!raw) return [];
    const out = [];
    for (const part of raw.split(",")){
        const value = part.trim();
        if (SNOWFLAKE.test(value) && !out.includes(value)) out.push(value);
    }
    return out;
}
function createStaffPolicy(input) {
    const ids = new Set([
        ...input.ownerIds ?? [],
        ...input.devIds ?? [],
        ...input.allowedUsers ?? []
    ].filter((id)=>SNOWFLAKE.test(id)));
    return {
        ids,
        isStaff: (discordId)=>!!discordId && ids.has(discordId)
    };
}
function staffPolicyFromEnv(env, scope) {
    const owner = parseSnowflakeCsv(env.OWNER_ID);
    const allowedUsers = parseSnowflakeCsv(env.OAUTH_ALLOWED_USERS);
    if (scope === "site") return createStaffPolicy({
        ownerIds: owner,
        allowedUsers
    });
    return createStaffPolicy({
        ownerIds: [
            ...owner,
            ...parseSnowflakeCsv(env.OWNER_IDS)
        ],
        devIds: parseSnowflakeCsv(env.BOT_DEV_ID),
        allowedUsers
    });
}
}),
"[project]/packages/auth/src/tokens.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ADMIN_COOKIE",
    ()=>ADMIN_COOKIE,
    "ADMIN_COOKIE_MIN_SECRET_LENGTH",
    ()=>ADMIN_COOKIE_MIN_SECRET_LENGTH,
    "ADMIN_COOKIE_TTL_MS",
    ()=>ADMIN_COOKIE_TTL_MS,
    "STATIC_BEARER_MIN_LENGTH",
    ()=>STATIC_BEARER_MIN_LENGTH,
    "acceptedStaticTokens",
    ()=>acceptedStaticTokens,
    "createAdminCookieCodec",
    ()=>createAdminCookieCodec,
    "verifyStaticBearer",
    ()=>verifyStaticBearer
]);
/**
 * Static Bearer tokens and the `dbfr_admin` cookie codec (runtime class `server`).
 *
 * The cookie format is byte-for-byte the one of `apps/site/src/lib/admin-token.ts`:
 * `${exp}.${hex(HMAC-SHA256(secret, "admin:" + exp + ":" + sha256Hex(token).slice(0, 16)))}`
 * with a 7-day TTL. The signature is bound to the fingerprint of the current
 * master token: rotating the token revokes every cookie already issued.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/auth/src/crypto.ts [middleware] (ecmascript)");
;
const STATIC_BEARER_MIN_LENGTH = 16;
function acceptedStaticTokens(accepted, minLength = STATIC_BEARER_MIN_LENGTH) {
    const out = [];
    for (const raw of accepted){
        const value = raw?.trim();
        if (value && value.length >= minLength) out.push(value);
    }
    return out;
}
function verifyStaticBearer(headers, accepted, options = {}) {
    const tokens = acceptedStaticTokens(accepted, options.minLength ?? STATIC_BEARER_MIN_LENGTH);
    if (tokens.length === 0) return "not_configured";
    const presented = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["parseBearer"])(headers, {
        caseSensitive: options.caseSensitive
    });
    if (presented === null) return "absent";
    let match = false;
    // Every configured token is compared: the loop never exits early.
    for (const token of tokens){
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["timingSafeEqualString"])(presented, token)) match = true;
    }
    return match ? "valid" : "invalid";
}
const ADMIN_COOKIE = "dbfr_admin";
const ADMIN_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_COOKIE_MIN_SECRET_LENGTH = 32;
function createAdminCookieCodec(options) {
    // An empty or short HMAC key makes the signature forgeable: refuse it.
    if (typeof options.secret !== "string" || options.secret.trim().length < ADMIN_COOKIE_MIN_SECRET_LENGTH) {
        throw new Error(`Admin cookie codec: secret must be at least ${ADMIN_COOKIE_MIN_SECRET_LENGTH} characters long.`);
    }
    const ttlMs = options.ttlMs ?? ADMIN_COOKIE_TTL_MS;
    const enabled = options.masterToken.length > 0;
    const fingerprint = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["sha256Hex"])(options.masterToken).slice(0, 16);
    const signature = (exp)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["hmacSha256Hex"])(options.secret, `admin:${exp}:${fingerprint}`);
    return {
        maxAgeSeconds: Math.floor(ttlMs / 1000),
        sign (nowMs = Date.now()) {
            if (!enabled) throw new Error("Admin cookie codec: no master token configured.");
            const exp = nowMs + ttlMs;
            return `${exp}.${signature(exp)}`;
        },
        verify (value, nowMs = Date.now()) {
            if (!value || !enabled) return false;
            const dot = value.indexOf(".");
            if (dot < 1) return false;
            const exp = Number(value.slice(0, dot));
            const sig = value.slice(dot + 1);
            if (!Number.isFinite(exp) || exp < nowMs) return false;
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$auth$2f$src$2f$crypto$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["timingSafeEqualString"])(sig, signature(exp));
        }
    };
}
}),
"[project]/packages/config/src/chronology.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Chronologie universelle Dragon Ball — modèle + helpers PURS et CLIENT-SAFE.
 *
 * Aucun import server (pas de `postgres`/drizzle) : utilisable à la fois par le
 * helper server-only `dbUniverse.timeline()` (qui construit le dataset), par le
 * composant public `ChronologyTimeline` (frise FIXE) ET par l'éditeur admin
 * (`/admin/timeline`, curation). C'est le seul point qui unifie les TROIS
 * espaces de séries disjoints (épisodes `DB/DBZ/DBGT/DBS/DB_DAIMA`, films
 * `DB_MOVIE/DBZ_MOVIE/DBZ_OVA/DBZ_SPECIAL/DBS_MOVIE`, et tomes de manga `DB/DBS`
 * rangés dans l'ère `Manga`) sous des « ères » communes.
 *
 * La chronologie publique est **fixe** : l'ordre officiel est décidé par l'admin
 * (curation `ChronologyConfig` stockée en DB) et appliqué par `applyChronology`.
 * Sans aucune curation, l'ordre est IDENTIQUE à l'ancien tri « ère » auto.
 */ __turbopack_context__.s([
    "DEFAULT_CHRONOLOGY_CONFIG",
    ()=>DEFAULT_CHRONOLOGY_CONFIG,
    "ERA_ACCENT",
    ()=>ERA_ACCENT,
    "ERA_LABELS",
    ()=>ERA_LABELS,
    "ERA_ORDER",
    ()=>ERA_ORDER,
    "SORT_LABELS",
    ()=>SORT_LABELS,
    "applyChronology",
    ()=>applyChronology,
    "compareTimeline",
    ()=>compareTimeline,
    "eraOf",
    ()=>eraOf,
    "resolveChronologyConfig",
    ()=>resolveChronologyConfig,
    "timelineKey",
    ()=>timelineKey,
    "toCSVExport",
    ()=>toCSVExport,
    "toJSONExport",
    ()=>toJSONExport,
    "toMarkdownExport",
    ()=>toMarkdownExport
]);
const ERA_ORDER = [
    "DB",
    "DBZ",
    "GT",
    "Super",
    "Daima",
    "Manga",
    "Autre"
];
const ERA_LABELS = {
    DB: "Dragon Ball",
    DBZ: "Dragon Ball Z",
    GT: "Dragon Ball GT",
    Super: "Dragon Ball Super",
    Daima: "Dragon Ball Daima",
    Manga: "Manga",
    Autre: "Autres"
};
const ERA_ACCENT = {
    DB: "#f5a623",
    DBZ: "#ff5a1f",
    GT: "#38b000",
    Super: "#3aa0ff",
    Daima: "#b47cff",
    Manga: "#ec4899",
    Autre: "#9ca3af"
};
function eraOf(series) {
    const s = (series ?? "").toUpperCase();
    if (!s) return "Autre";
    if (s.includes("DAIMA")) return "Daima";
    if (s.includes("GT")) return "GT"; // DBGT
    if (s.startsWith("DBS")) return "Super"; // DBS, DBS_MOVIE, DBS_MANGA
    if (s.startsWith("DBZ")) return "DBZ"; // DBZ, DBZ_KAI, DBZ_MOVIE, DBZ_OVA, DBZ_SPECIAL
    if (s.startsWith("DB")) return "DB"; // DB, DB_MOVIE
    return "Autre";
}
function eraRank(era) {
    const i = ERA_ORDER.indexOf(era);
    return i === -1 ? ERA_ORDER.length : i;
}
/** Ordre déterministe des natures pour les départages (épisode → film → tome). */ const KIND_RANK = {
    episode: 0,
    movie: 1,
    manga: 2
};
/** Libellé FR d'une nature (exports). */ const KIND_LABEL = {
    episode: "épisode",
    movie: "film",
    manga: "tome"
};
/** Pictogramme d'une nature (export markdown). */ const KIND_EMOJI = {
    episode: "📺",
    movie: "🎬",
    manga: "📖"
};
const SORT_LABELS = {
    era: "Chronologie officielle",
    date: "Diffusion / sortie",
    title: "Titre (A→Z)"
};
const timelineKey = (it)=>`${it.kind}:${it.id}`;
const INF = Number.POSITIVE_INFINITY;
function compareTimeline(mode) {
    if (mode === "title") {
        return (a, b)=>a.title.localeCompare(b.title, "fr") || a.id - b.id;
    }
    if (mode === "date") {
        return (a, b)=>{
            const d = (a.date ?? INF) - (b.date ?? INF);
            if (d) return d;
            const e = eraRank(a.era) - eraRank(b.era);
            if (e) return e;
            // Les entrées sans date (tomes manga) restent groupées par série puis numéro
            // (DB 1→42 puis DBS 1→23), pas entrelacées par numéro croisé.
            const s = a.series.localeCompare(b.series);
            if (s) return s;
            return (a.number ?? INF) - (b.number ?? INF) || a.id - b.id;
        };
    }
    // "era" : ère éditoriale → date (les dates manquantes retombent sur série+numéro)
    // → épisode avant film avant tome → id. Interleave les films par date parmi les
    // épisodes ; garde les tomes d'une même série contigus (ils n'ont pas de date).
    return (a, b)=>{
        const e = eraRank(a.era) - eraRank(b.era);
        if (e) return e;
        const d = (a.date ?? INF) - (b.date ?? INF);
        if (d) return d;
        const s = a.series.localeCompare(b.series);
        if (s) return s;
        const n = (a.number ?? INF) - (b.number ?? INF);
        if (n) return n;
        if (a.kind !== b.kind) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
        return a.id - b.id;
    };
}
const DEFAULT_CHRONOLOGY_CONFIG = {
    version: 1,
    eraOrder: [
        ...ERA_ORDER
    ],
    overrides: {}
};
const isEra = (v)=>ERA_ORDER.includes(v);
function resolveChronologyConfig(patch) {
    if (!patch || typeof patch !== "object") return structuredClone(DEFAULT_CHRONOLOGY_CONFIG);
    const p = patch;
    // eraOrder : uniquement des ères connues, sans doublon, complété par le reste.
    const eraOrder = [];
    if (Array.isArray(p.eraOrder)) {
        for (const e of p.eraOrder)if (isEra(e) && !eraOrder.includes(e)) eraOrder.push(e);
    }
    for (const e of ERA_ORDER)if (!eraOrder.includes(e)) eraOrder.push(e);
    // overrides : normalise chaque entrée, ne garde que celles qui portent un champ.
    const overrides = {};
    const rawOv = p.overrides;
    if (rawOv && typeof rawOv === "object") {
        for (const [key, v] of Object.entries(rawOv)){
            if (!v || typeof v !== "object") continue;
            const o = v;
            const out = {};
            if (o.hidden === true) out.hidden = true;
            if (isEra(o.era)) out.era = o.era;
            if (typeof o.date === "number" && Number.isFinite(o.date)) out.date = Math.round(o.date);
            else if (o.date === null) out.date = null;
            if (typeof o.title === "string" && o.title.trim()) out.title = o.title.trim().slice(0, 300);
            if (typeof o.note === "string" && o.note.trim()) out.note = o.note.trim().slice(0, 600);
            if (typeof o.sort === "number" && Number.isFinite(o.sort)) out.sort = Math.round(o.sort);
            if (Object.keys(out).length > 0) overrides[key] = out;
        }
    }
    return {
        version: 1,
        eraOrder,
        overrides
    };
}
function applyChronology(items, config) {
    const eraRankOf = (era)=>{
        const i = config.eraOrder.indexOf(era);
        return i === -1 ? config.eraOrder.length : i;
    };
    const sortOf = new Map();
    const resolved = [];
    for (const it of items){
        const key = timelineKey(it);
        const ov = config.overrides[key];
        if (ov?.hidden) continue;
        const era = ov?.era ?? it.era;
        resolved.push({
            ...it,
            era,
            date: ov && "date" in ov ? ov.date ?? null : it.date,
            title: ov?.title ?? it.title,
            note: ov?.note ?? null
        });
        if (typeof ov?.sort === "number") sortOf.set(key, ov.sort);
    }
    // Une ère est « épinglée » dès qu'une de ses entrées porte un rang manuel.
    const pinnedEras = new Set();
    for (const it of resolved)if (sortOf.has(timelineKey(it))) pinnedEras.add(it.era);
    resolved.sort((a, b)=>{
        const e = eraRankOf(a.era) - eraRankOf(b.era);
        if (e) return e;
        if (pinnedEras.has(a.era)) {
            const sa = sortOf.get(timelineKey(a)) ?? INF;
            const sb = sortOf.get(timelineKey(b)) ?? INF;
            if (sa !== sb) return sa - sb;
        }
        const d = (a.date ?? INF) - (b.date ?? INF);
        if (d) return d;
        const s = a.series.localeCompare(b.series);
        if (s) return s;
        const n = (a.number ?? INF) - (b.number ?? INF);
        if (n) return n;
        if (a.kind !== b.kind) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
        return a.id - b.id;
    });
    return resolved;
}
// --- Formats d'export (chronologie officielle exportable) -------------------
function isoDate(sec) {
    if (!sec) return "";
    return new Date(sec * 1000).toISOString().slice(0, 10);
}
function toJSONExport(items) {
    return JSON.stringify(items.map((it, i)=>({
            ordre: i + 1,
            type: KIND_LABEL[it.kind],
            ere: ERA_LABELS[it.era],
            serie: it.series,
            numero: it.number,
            titre: it.title,
            titre_ja: it.titleJa,
            date: isoDate(it.date),
            url: it.href
        })), null, 2);
}
function csvCell(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSVExport(items) {
    const header = [
        "ordre",
        "type",
        "ere",
        "serie",
        "numero",
        "titre",
        "titre_ja",
        "date",
        "url"
    ];
    const rows = items.map((it, i)=>[
            i + 1,
            KIND_LABEL[it.kind],
            ERA_LABELS[it.era],
            it.series,
            it.number ?? "",
            it.title,
            it.titleJa ?? "",
            isoDate(it.date),
            it.href
        ].map(csvCell).join(","));
    return [
        header.join(","),
        ...rows
    ].join("\n");
}
function toMarkdownExport(items) {
    const lines = items.map((it, i)=>{
        const tag = KIND_EMOJI[it.kind];
        const num = it.number != null ? `${it.kind === "manga" ? "Tome " : "#"}${it.number} ` : "";
        const date = it.date ? ` (${isoDate(it.date)})` : "";
        return `${i + 1}. ${tag} **[${ERA_LABELS[it.era]}]** ${num}${it.title}${date}`;
    });
    return `# Chronologie Dragon Ball — ${items.length} entrées\n\n${lines.join("\n")}\n`;
}
}),
"[project]/packages/config/src/env.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/**
 * Environment reading discipline shared by every `@aphrody/shenron-*` package.
 *
 * Runtime class: `pure`. Nothing here reads `process.env` on its own: the
 * caller always passes an {@link EnvSource} (usually `process.env`) at call
 * time, so importing this module is side-effect free in any runtime.
 *
 * Every {@link EnvIssue} carries a variable name and a problem kind, never a
 * value: issues can be logged, returned in a health payload or serialised in a
 * test report without leaking a secret.
 */ __turbopack_context__.s([
    "ENV_ALIASES",
    ()=>ENV_ALIASES,
    "checkAlias",
    ()=>checkAlias,
    "envFirst",
    ()=>envFirst,
    "envString",
    ()=>envString,
    "isProduction",
    ()=>isProduction,
    "parseEnv",
    ()=>parseEnv
]);
/** Values that shell interpolation accidents produce and that mean "unset". */ const UNSET_LITERALS = new Set([
    "",
    "undefined",
    "null"
]);
function envString(env, name) {
    const raw = env[name];
    if (typeof raw !== "string") return undefined;
    const value = raw.trim();
    return UNSET_LITERALS.has(value) ? undefined : value;
}
function envFirst(env, names) {
    for (const name of names){
        const value = envString(env, name);
        if (value !== undefined) return {
            name,
            value
        };
    }
    return undefined;
}
function isProduction(env) {
    return envString(env, "NODE_ENV") === "production";
}
const ENV_ALIASES = {
    adminToken: [
        "SHENRON_ADMIN_TOKEN",
        "API_ADMIN_TOKEN"
    ],
    actingUserSecret: [
        "SHENRON_USER_SECRET",
        "API_USER_SECRET"
    ],
    coordDir: [
        "A2A_COORD_DIR",
        "COORD_DIR"
    ],
    ragGold: [
        "RAG_GOLD_PATH",
        "RAG_GOLD"
    ]
};
function checkAlias(env, names) {
    const set = [];
    for (const name of names){
        const value = envString(env, name);
        if (value !== undefined) set.push({
            name,
            value
        });
    }
    const first = set[0];
    if (!first) return null;
    const other = set.find((entry)=>entry.value !== first.value);
    if (!other) return null;
    return {
        name: first.name,
        problem: "mismatch",
        hint: `${first.name} and ${other.name} are both set with different values; set one value for ${names.join(", ")}`
    };
}
/**
 * Removes every occurrence of `secrets` from `text`. Values shorter than three
 * characters are not scrubbed: they cannot be secrets and would shred hints.
 */ function scrub(text, secrets) {
    let out = text;
    for (const secret of secrets){
        if (secret.length < 3) continue;
        out = out.split(secret).join("[redacted]");
    }
    return out;
}
function parseEnv(schema, env) {
    const normalised = {};
    for (const name of Object.keys(env)){
        const value = envString(env, name);
        if (value !== undefined) normalised[name] = value;
    }
    const result = schema.safeParse(normalised);
    if (result.success) return {
        ok: true,
        value: result.data
    };
    const issues = [];
    const seen = new Set();
    for (const issue of result.error.issues){
        const head = issue.path[0];
        const name = typeof head === "string" ? head : head === undefined ? "(root)" : String(head);
        const raw = typeof head === "string" ? env[head] : undefined;
        const secrets = typeof raw === "string" ? [
            raw,
            raw.trim()
        ] : [];
        const missing = typeof head === "string" && normalised[head] === undefined;
        const problem = missing ? "missing" : "invalid";
        const key = `${name}\u0000${problem}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({
            name,
            problem,
            hint: scrub(issue.message, secrets)
        });
    }
    return {
        ok: false,
        issues
    };
}
}),
"[project]/packages/config/src/favorites.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "FAVORITES_BODY_MAX",
    ()=>FAVORITES_BODY_MAX,
    "FAVORITES_MAX",
    ()=>FAVORITES_MAX,
    "FAVORITE_KINDS",
    ()=>FAVORITE_KINDS,
    "sanitizeFavorites",
    ()=>sanitizeFavorites,
    "sanitizeInternalPath",
    ()=>sanitizeInternalPath
]);
const FAVORITE_KINDS = [
    "episode",
    "movie",
    "chapter",
    "databook",
    "character",
    "saga",
    "game"
];
const FAVORITES_MAX = 200;
const FAVORITES_BODY_MAX = 512 * 1024;
function sanitizeInternalPath(value, maxLength = 512) {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    if (!raw || raw.length > maxLength || !raw.startsWith("/") || raw.includes("\\")) {
        return null;
    }
    const base = "https://dbfr.invalid";
    try {
        const parsed = new URL(raw, base);
        if (parsed.origin !== base) return null;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch  {
        return null;
    }
}
const KINDS = new Set(FAVORITE_KINDS);
function sanitizeFavorites(input) {
    if (!Array.isArray(input)) return [];
    const str = (v, max)=>typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
    const out = [];
    const seen = new Set();
    for (const raw of input.slice(0, FAVORITES_MAX)){
        if (!raw || typeof raw !== "object") continue;
        const f = raw;
        const kind = str(f.kind, 20);
        const id = str(f.id, 64);
        const title = str(f.title, 200);
        const href = sanitizeInternalPath(f.href, 300);
        if (!kind || !KINDS.has(kind) || !id || !title || !href) continue;
        const key = `${kind}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
            kind: kind,
            id,
            title,
            href,
            image: str(f.image, 300),
            caption: str(f.caption, 120),
            at: typeof f.at === "number" && Number.isFinite(f.at) ? f.at : Date.now()
        });
    }
    return out;
}
}),
"[project]/packages/config/src/legacy-routes.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * legacy-routes — the former French addresses of the site and their English homes.
 *
 * Routes, API paths and query parameters are English; an address that was once
 * published keeps answering. This module is the single table of those moves:
 *
 *  - `PUBLIC_ROUTE_RENAMES`: public pages, answered with a 308 by `next.config.ts`
 *    (`redirects()`), before the proxy and before any render;
 *  - `STAFF_ROUTE_RENAMES`: administration and staff tools, answered with a 308 by
 *    `proxy.ts` AFTER the staff guard (an anonymous visitor learns nothing);
 *  - `API_ROUTE_ALIASES`: site API paths, served by the new handler through a
 *    `beforeFiles` rewrite (no redirect: a POST must not be turned into a GET, and
 *    the bot, the plugin and the MCP server still call some of them).
 *
 * Pure and import-free on purpose: `next.config.ts` loads it by relative path.
 * `tests/english-routes.test.ts` checks every target against `src/app`.
 */ __turbopack_context__.s([
    "API_ROUTE_ALIASES",
    ()=>API_ROUTE_ALIASES,
    "PUBLIC_ROUTE_RENAMES",
    ()=>PUBLIC_ROUTE_RENAMES,
    "STAFF_ROUTE_RENAMES",
    ()=>STAFF_ROUTE_RENAMES,
    "WORKSHOP_STAFF_PREFIXES",
    ()=>WORKSHOP_STAFF_PREFIXES,
    "nextApiRewrites",
    ()=>nextApiRewrites,
    "nextRedirectsOf",
    ()=>nextRedirectsOf,
    "publicLegacyRedirect",
    ()=>publicLegacyRedirect,
    "renameLegacyPath",
    ()=>renameLegacyPath,
    "staffLegacyRedirect",
    ()=>staffLegacyRedirect
]);
const PUBLIC_ROUTE_RENAMES = [
    // Encyclopaedia sections.
    {
        from: "/wiki/personnages",
        to: "/wiki/characters"
    },
    {
        from: "/wiki/lieux",
        to: "/wiki/locations"
    },
    {
        from: "/wiki/objets",
        to: "/wiki/items"
    },
    {
        from: "/wiki/evenements",
        to: "/wiki/events"
    },
    {
        from: "/wiki/musiques",
        to: "/wiki/music"
    },
    {
        from: "/wiki/puissances",
        to: "/wiki/power-levels"
    },
    {
        from: "/wiki/chronologie",
        to: "/wiki/timeline"
    },
    {
        from: "/wiki/jeux",
        to: "/wiki/games"
    },
    {
        from: "/wiki/contribuer",
        to: "/wiki/contribute"
    },
    // The contributors index was merged into the staff page; profiles stay.
    {
        from: "/wiki/contributeurs",
        to: "/wiki/staff",
        restTo: "/wiki/contributors"
    },
    {
        from: "/wiki/corriger",
        to: "/wiki/corrections"
    },
    {
        from: "/wiki/films",
        to: "/wiki/movies"
    },
    {
        from: "/wiki/hasard",
        to: "/wiki/random"
    },
    {
        from: "/wiki/episodes/serie",
        to: "/wiki/episodes/series"
    },
    {
        from: "/wiki/manga/revue",
        to: "/wiki/manga/review"
    },
    // Retired sections, merged into their hub (former and English names alike).
    {
        from: "/wiki/combats",
        to: "/wiki/events",
        keepRest: false
    },
    {
        from: "/wiki/battles",
        to: "/wiki/events",
        keepRest: false
    },
    {
        from: "/wiki/tournois",
        to: "/wiki/events",
        keepRest: false
    },
    {
        from: "/wiki/tournaments",
        to: "/wiki/events",
        keepRest: false
    },
    {
        from: "/wiki/voix",
        to: "/wiki/staff",
        keepRest: false
    },
    {
        from: "/wiki/voice-actors",
        to: "/wiki/staff",
        keepRest: false
    },
    {
        from: "/wiki/romans",
        to: "/wiki/manga",
        keepRest: false
    },
    {
        from: "/wiki/novels",
        to: "/wiki/manga",
        keepRest: false
    },
    {
        from: "/wiki/dragons",
        to: "/wiki/characters",
        keepRest: false
    },
    {
        from: "/wiki/cosmologie",
        to: "/wiki/locations",
        keepRest: false
    },
    {
        from: "/wiki/planetes",
        to: "/wiki/locations",
        keepRest: false
    },
    {
        from: "/wiki/autour-de-dragon-ball",
        to: "/wiki/staff",
        keepRest: false
    },
    // Site sections.
    {
        from: "/jeux/morpion",
        to: "/games/tic-tac-toe"
    },
    {
        from: "/jeux/pfc",
        to: "/games/rock-paper-scissors"
    },
    {
        from: "/jeux",
        to: "/games"
    },
    {
        from: "/classements",
        to: "/rankings"
    },
    {
        from: "/confidentialite",
        to: "/privacy"
    },
    {
        from: "/licence",
        to: "/license"
    },
    {
        from: "/parametres",
        to: "/settings"
    },
    {
        from: "/profil",
        to: "/profile/me",
        restTo: "/profile"
    },
    {
        from: "/favoris",
        to: "/favorites"
    },
    {
        from: "/plan-du-site",
        to: "/site-map"
    },
    {
        from: "/wiki-bientot",
        to: "/coming-soon"
    },
    {
        from: "/tierlists/creer",
        to: "/tierlists/new"
    },
    {
        from: "/tierlists/mes",
        to: "/tierlists/mine"
    },
    {
        from: "/news/fil",
        to: "/news/feed"
    },
    // Only the public overview of the workshop: its staff tools move in the proxy.
    {
        from: "/atelier",
        to: "/workshop",
        exact: true
    },
    // Shenron Studio: the translation editor left its code name (`/koharu`) for `/studio`; the
    // desktop home (`/bureau`) is `/desktop`. The former `/studio` (desktop control page) is
    // now `/desktop/control` and cannot be redirected: `/studio` is the editor.
    {
        from: "/koharu",
        to: "/studio"
    },
    {
        from: "/bureau",
        to: "/desktop"
    }
];
const WORKSHOP_STAFF_PREFIXES = [
    "/workshop/transcription",
    "/workshop/translation",
    "/workshop/databooks"
];
const STAFF_ROUTE_RENAMES = [
    {
        from: "/atelier/transcription",
        to: "/workshop/transcription"
    },
    {
        from: "/atelier/traduction",
        to: "/workshop/translation"
    },
    // `/workshop/databooks` seul n'a pas de page : la liste des ouvrages est l'onglet Transcription.
    {
        from: "/atelier/databooks",
        to: "/workshop/transcription",
        restTo: "/workshop/databooks"
    },
    {
        from: "/admin/transcriptions",
        to: "/workshop/transcription",
        keepRest: false
    },
    {
        from: "/admin/databooks",
        to: "/workshop/translation",
        restTo: "/workshop/databooks"
    },
    {
        from: "/admin/activite",
        to: "/admin/activity"
    },
    {
        from: "/admin/campagnes-bxc",
        to: "/admin/bxc-campaigns"
    },
    {
        from: "/admin/chronologie",
        to: "/admin/timeline"
    },
    {
        from: "/admin/concours",
        to: "/admin/contests"
    },
    {
        from: "/admin/ia",
        to: "/admin/ai"
    },
    {
        from: "/admin/assistance-ia",
        to: "/admin/ai?tab=overview",
        keepRest: false
    },
    {
        from: "/admin/lancement",
        to: "/admin/launch"
    },
    {
        from: "/admin/signalements",
        to: "/admin/reports"
    },
    {
        from: "/admin/ursaf",
        to: "/admin/taxes"
    },
    {
        from: "/admin/visibilite",
        to: "/admin/visibility"
    },
    {
        from: "/admin/commandes",
        to: "/admin/command-runner"
    },
    {
        from: "/admin/moderation/commentaires",
        to: "/admin/moderation/comments"
    },
    {
        from: "/admin/db-universe/films",
        to: "/admin/db-universe/movies"
    }
];
const API_ROUTE_ALIASES = [
    {
        from: "/api/chronologie",
        to: "/api/timeline"
    },
    {
        from: "/api/chronologie-config",
        to: "/api/timeline-config"
    },
    {
        from: "/api/admin/entites",
        to: "/api/admin/entities"
    },
    {
        from: "/api/admin/ia",
        to: "/api/admin/ai"
    },
    {
        from: "/api/admin/databooks/campagne",
        to: "/api/admin/databooks/campaign"
    },
    {
        from: "/api/databooks/:id/textes",
        to: "/api/databooks/:id/texts"
    },
    {
        from: "/api/databooks/:id/relecture-ocr",
        to: "/api/databooks/:id/ocr-review"
    },
    {
        from: "/api/manga/chapter/:id/planche/:n/traduction",
        to: "/api/manga/chapter/:id/pages/:n/translation"
    },
    {
        from: "/api/manga/chapter/:id/planche",
        to: "/api/manga/chapter/:id/pages"
    }
];
const within = (pathname, prefix)=>pathname === prefix || pathname.startsWith(`${prefix}/`);
function renameLegacyPath(pathname, table) {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    for (const rule of table){
        if (rule.exact ? path !== rule.from : !within(path, rule.from)) continue;
        if (path === rule.from || rule.keepRest === false) return rule.to;
        return `${rule.restTo ?? rule.to}${path.slice(rule.from.length)}`;
    }
    return null;
}
function publicLegacyRedirect(pathname) {
    return renameLegacyPath(pathname, PUBLIC_ROUTE_RENAMES);
}
function staffLegacyRedirect(pathname) {
    return renameLegacyPath(pathname, STAFF_ROUTE_RENAMES);
}
function nextRedirectsOf(table) {
    return table.flatMap((rule)=>[
            {
                source: rule.from,
                destination: rule.to,
                permanent: true
            },
            ...rule.exact ? [] : [
                {
                    source: `${rule.from}/:rest+`,
                    destination: rule.keepRest === false ? rule.to : `${rule.restTo ?? rule.to}/:rest+`,
                    permanent: true
                }
            ]
        ]);
}
function nextApiRewrites() {
    return API_ROUTE_ALIASES.flatMap((alias)=>[
            {
                source: alias.from,
                destination: alias.to
            },
            {
                source: `${alias.from}/:rest+`,
                destination: `${alias.to}/:rest+`
            }
        ]);
}
}),
"[project]/packages/config/src/net.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/**
 * Network guards shared by every `@aphrody/shenron-*` package: the single loopback /
 * HTTPS URL doctrine (formerly copied in `compute.ts`, `shenron-embeddings.ts`,
 * `web.ts` and `ia-cockpit.ts`) and the client IP doctrine of
 * `apps/site/src/app/api/_client-ip.ts`.
 *
 * Runtime class: `pure` (only `URL` and `Headers`).
 */ __turbopack_context__.s([
    "clientIpFromHeaders",
    ()=>clientIpFromHeaders,
    "ipInRanges",
    ()=>ipInRanges,
    "isDirectLoopback",
    ()=>isDirectLoopback,
    "isLoopbackHost",
    ()=>isLoopbackHost,
    "parseHttpsOrLoopbackUrl",
    ()=>parseHttpsOrLoopbackUrl,
    "parseIp",
    ()=>parseIp,
    "parseIpAllowlist",
    ()=>parseIpAllowlist,
    "parseIpRange",
    ()=>parseIpRange,
    "parseLoopbackHttpUrl",
    ()=>parseLoopbackHttpUrl
]);
/**
 * Exactly the loopback host forms accepted today by the Aphrody clients:
 * the IPv4 loopback literal, the bracketed IPv6 form produced by `URL`, the
 * bare IPv6 form produced by socket addresses, and `localhost`. The rest of
 * `127.0.0.0/8` is deliberately NOT accepted.
 */ const LOOPBACK_HOSTS = new Set([
    "127.0.0.1",
    "[::1]",
    "::1",
    "localhost"
]);
/** IPv4-mapped IPv6 form of the loopback literal reported by dual-stack sockets. */ const MAPPED_IPV4_LOOPBACK = "::ffff:127.0.0.1";
function isLoopbackHost(hostname) {
    return LOOPBACK_HOSTS.has(hostname);
}
function parseUrl(raw, label) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value === "" || value === "undefined" || value === "null") {
        return {
            ok: false,
            issue: {
                name: label,
                problem: "missing"
            }
        };
    }
    let url;
    try {
        url = new URL(value);
    } catch  {
        return {
            ok: false,
            issue: {
                name: label,
                problem: "invalid",
                hint: "not a valid absolute URL"
            }
        };
    }
    if (url.username || url.password) {
        return {
            ok: false,
            issue: {
                name: label,
                problem: "invalid",
                hint: "credentials are not allowed in the URL"
            }
        };
    }
    return {
        ok: true,
        url
    };
}
function parseLoopbackHttpUrl(raw, label) {
    const parsed = parseUrl(raw, label);
    if (!parsed.ok) return parsed;
    const { url } = parsed;
    if (url.protocol !== "http:") {
        return {
            ok: false,
            issue: {
                name: label,
                problem: "invalid",
                hint: "must use http:// on a loopback host"
            }
        };
    }
    if (!isLoopbackHost(url.hostname)) {
        return {
            ok: false,
            issue: {
                name: label,
                problem: "invalid",
                hint: "must target a loopback host"
            }
        };
    }
    url.search = "";
    url.hash = "";
    return {
        ok: true,
        url
    };
}
function parseHttpsOrLoopbackUrl(raw, label) {
    const parsed = parseUrl(raw, label);
    if (!parsed.ok) return parsed;
    const { url } = parsed;
    const loopbackHttp = url.protocol === "http:" && isLoopbackHost(url.hostname);
    if (url.protocol !== "https:" && !loopbackHttp) {
        return {
            ok: false,
            issue: {
                name: label,
                problem: "invalid",
                hint: "must use https://, or http:// on a loopback host"
            }
        };
    }
    url.search = "";
    url.hash = "";
    return {
        ok: true,
        url
    };
}
function clientIpFromHeaders(headers) {
    const realIp = headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
    const xff = headers.get("x-forwarded-for");
    if (xff) {
        const parts = xff.split(",").map((part)=>part.trim()).filter(Boolean);
        const last = parts[parts.length - 1];
        if (last) return last;
    }
    return "unknown";
}
function isDirectLoopback(headers, remoteAddress) {
    if (!remoteAddress) return false;
    if (!isLoopbackHost(remoteAddress) && remoteAddress !== MAPPED_IPV4_LOOPBACK) return false;
    return !headers.has("x-real-ip") && !headers.has("x-forwarded-for");
}
function ipv4ToBigInt(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    let value = 0n;
    for (const part of parts){
        if (!/^\d{1,3}$/.test(part)) return null;
        const n = Number(part);
        if (n > 255) return null;
        value = value << 8n | BigInt(n);
    }
    return value;
}
function ipv6ToBigInt(ip) {
    let text = ip.toLowerCase();
    // Suffixe IPv4 (`::ffff:1.2.3.4`) : deux groupes de 16 bits.
    const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
    if (dotted) {
        const v4 = ipv4ToBigInt(dotted[2]);
        if (v4 === null) return null;
        text = `${dotted[1]}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
    }
    const halves = text.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
    const groups = [
        ...head,
        ...Array(halves.length === 2 ? missing : 0).fill("0"),
        ...tail
    ];
    let value = 0n;
    for (const group of groups){
        if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
        value = value << 16n | BigInt(Number.parseInt(group, 16));
    }
    return value;
}
function parseIp(raw) {
    const ip = raw.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
    const v4 = ipv4ToBigInt(ip);
    if (v4 !== null) return {
        family: 4,
        base: v4,
        prefix: 32
    };
    const v6 = ipv6ToBigInt(ip);
    if (v6 === null) return null;
    // `::ffff:a.b.c.d` est l'adresse IPv4 a.b.c.d (écouteurs double pile).
    if (v6 >> 32n === 0xffffn) return {
        family: 4,
        base: v6 & 0xffffffffn,
        prefix: 32
    };
    return {
        family: 6,
        base: v6,
        prefix: 128
    };
}
function parseIpRange(raw) {
    const [address, length, extra] = raw.trim().split("/");
    if (!address || extra !== undefined) return null;
    const ip = parseIp(address);
    if (!ip) return null;
    if (length === undefined) return ip;
    if (!/^\d{1,3}$/.test(length)) return null;
    const max = ip.family === 4 ? 32 : 128;
    const prefix = Number(length);
    if (prefix > max) return null;
    const bits = BigInt(max - prefix);
    return {
        family: ip.family,
        base: ip.base >> bits << bits,
        prefix
    };
}
function parseIpAllowlist(raw) {
    const ranges = [];
    const invalid = [];
    for (const entry of (raw ?? "").split(/[\s,]+/)){
        if (!entry) continue;
        const range = parseIpRange(entry);
        if (range) ranges.push(range);
        else invalid.push(entry);
    }
    return {
        ranges,
        invalid
    };
}
function ipInRanges(ip, ranges) {
    const address = parseIp(ip);
    if (!address) return false;
    return ranges.some((range)=>{
        if (range.family !== address.family) return false;
        const bits = BigInt((range.family === 4 ? 32 : 128) - range.prefix);
        return address.base >> bits === range.base >> bits;
    });
}
}),
"[project]/packages/config/src/page-banners.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_PAGE_BANNERS",
    ()=>DEFAULT_PAGE_BANNERS,
    "PAGE_HERO_KEYS",
    ()=>PAGE_HERO_KEYS,
    "PAGE_HERO_LABELS",
    ()=>PAGE_HERO_LABELS,
    "SERIES_BANNER_KEYS",
    ()=>SERIES_BANNER_KEYS,
    "SERIES_BANNER_LABELS",
    ()=>SERIES_BANNER_LABELS,
    "createDefaultPageBanners",
    ()=>createDefaultPageBanners,
    "resolvePageBanners",
    ()=>resolvePageBanners
]);
/**
 * Bannières de pages & séries — types + défauts **client-safe**.
 *
 * Aucune dépendance server-only : importé par l'éditeur admin (`/admin/banners`)
 * et par `lib/banner-config.ts` (lecture/écriture PG). Les valeurs sont des URL
 * absolues (`https://bot…/db/…`) ou des chemins d'asset (`./assets/wiki/…`)
 * résolus via `resolveBannerUrl`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/public-urls.ts [middleware] (ecmascript)");
;
const API = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_PUBLIC_ORIGINS"].api;
const PAGE_HERO_KEYS = [
    "episodes",
    "films",
    "chronologie",
    "personnages",
    "sagas",
    "arcs",
    "races",
    "transformations",
    "techniques",
    "jeux",
    "manga",
    "databooks",
    "combats",
    "dragons",
    "lieux",
    "musiques",
    "objets",
    "puissances",
    "news",
    "tools",
    "staff"
];
const PAGE_HERO_LABELS = {
    episodes: "Épisodes (landing)",
    films: "Films (landing)",
    chronologie: "Chronologie",
    personnages: "Personnages / planètes",
    sagas: "Sagas & arcs",
    arcs: "Arcs (redirigé → sagas)",
    races: "Races",
    transformations: "Transformations",
    techniques: "Techniques",
    jeux: "Jeux vidéo",
    manga: "Manga (repli sans cover)",
    databooks: "Databooks (repli sans cover)",
    combats: "Combats légendaires",
    dragons: "Dragons et vœux",
    lieux: "Lieux et sanctuaires",
    musiques: "Musiques et génériques",
    objets: "Objets et technologies",
    puissances: "Niveaux de puissance",
    news: "Actualités / news wiki",
    tools: "Outils communautaires",
    staff: "Autour de Dragon Ball (Staff & Toriyama)"
};
const SERIES_BANNER_KEYS = [
    "DB",
    "DBZ",
    "DBZ_KAI",
    "DBZ_KAI_FINAL",
    "DBGT",
    "DBS",
    "DBS_BEERUS",
    "DBS_MANGA",
    "DBS_MOVIE",
    "DB_DAIMA",
    "DB_MOVIE",
    "DBZ_MOVIE",
    "DBZ_OVA",
    "DBZ_SPECIAL",
    "DBGT_SPECIAL",
    "DB_DAIMA_MOVIE"
];
const SERIES_BANNER_LABELS = {
    DB: "Dragon Ball",
    DBZ: "Dragon Ball Z",
    DBZ_KAI: "Dragon Ball Z Kai",
    DBZ_KAI_FINAL: "DBZ Kai – Final Chapters",
    DBGT: "Dragon Ball GT",
    DBS: "Dragon Ball Super",
    DBS_BEERUS: "Dragon Ball Super: Beerus",
    DBS_MANGA: "DBS Manga",
    DBS_MOVIE: "DBS Films",
    DB_DAIMA: "Dragon Ball Daima",
    DB_MOVIE: "Films DB",
    DBZ_MOVIE: "Films DBZ",
    DBZ_OVA: "OVA DBZ",
    DBZ_SPECIAL: "Spéciaux DBZ",
    DBGT_SPECIAL: "Spéciaux GT",
    DB_DAIMA_MOVIE: "Films Daima"
};
const FALLBACK = "/banners/banner-03.png";
const HD_DB_GOKU_SHENRON = "/banners/banner-17.jpg"; // DB Enfant + Shenron (3216x1072)
const HD_DBZ_WARRIORS = "/banners/banner-03.png"; // Z Warriors (3216x1072)
const HD_DBZ_CELL_ERA = "/banners/banner-04.jpg"; // 5 Super Saiyans (3216x1072)
const HD_DBZ_NAMEK = "/banners/banner-06.jpg"; // Goku SSJ vs Frieza (3216x1072)
const HD_DBZ_BUU = "/banners/banner-12.jpg"; // Goku SSJ3 (3216x1072)
const HD_DBGT = "/banners/banner-07.jpg"; // Goku & Vegeta SSJ4 (3216x1072)
const HD_DBS_UI = "/banners/banner-02.jpg"; // Ultra Instinct (3216x1072)
const HD_FILMS = "/banners/banner-09.png"; // Gogeta vs Janemba (3216x1072)
const HD_GAMES = "/banners/banner-15.jpg"; // Vegito SSB (3216x1072)
const HD_TRANSFO = "/banners/banner-19.png"; // Goku & Gohan SSJ3 (3216x1072)
const HD_NEWS = "/banners/banner-10.jpg"; // Goku SSG vs Beerus (3216x1072)
const TOEI_DAIMA = `${API}/db/toei/189-DB-DAIMA-HP-Header-1920x595.png`;
const DEFAULT_PAGE_BANNERS = {
    pages: {
        episodes: HD_DBZ_WARRIORS,
        films: HD_FILMS,
        chronologie: HD_DBZ_WARRIORS,
        personnages: HD_DBZ_WARRIORS,
        sagas: HD_DBZ_CELL_ERA,
        arcs: HD_DBZ_CELL_ERA,
        races: HD_DBZ_WARRIORS,
        transformations: HD_TRANSFO,
        techniques: HD_DBZ_NAMEK,
        jeux: HD_GAMES,
        manga: HD_DB_GOKU_SHENRON,
        databooks: "/banners/banner-14.jpg",
        // Correspondances éditoriales : bannières HD déjà livrées par le site,
        // sans image de fan ni génération artificielle.
        combats: HD_DBZ_NAMEK,
        dragons: HD_DB_GOKU_SHENRON,
        lieux: HD_DB_GOKU_SHENRON,
        musiques: HD_DBZ_WARRIORS,
        objets: HD_DB_GOKU_SHENRON,
        puissances: HD_DBZ_NAMEK,
        news: HD_NEWS,
        tools: HD_GAMES,
        staff: HD_DB_GOKU_SHENRON
    },
    series: {
        DB: HD_DB_GOKU_SHENRON,
        DBZ: HD_DBZ_WARRIORS,
        DBZ_KAI: HD_DBZ_NAMEK,
        DBZ_KAI_FINAL: HD_DBZ_BUU,
        DBGT: HD_DBGT,
        DBS: HD_DBS_UI,
        DBS_BEERUS: HD_DBS_UI,
        DBS_MANGA: HD_TRANSFO,
        DBS_MOVIE: HD_GAMES,
        DB_DAIMA: TOEI_DAIMA,
        DB_MOVIE: "/banners/banner-05.jpg",
        DBZ_MOVIE: HD_FILMS,
        DBZ_OVA: "/banners/banner-01.jpg",
        DBZ_SPECIAL: "/banners/banner-08.jpg",
        DBGT_SPECIAL: HD_DBGT,
        DB_DAIMA_MOVIE: TOEI_DAIMA
    },
    fallback: FALLBACK
};
function resolvePageBanners(patch, defaults = DEFAULT_PAGE_BANNERS) {
    const base = structuredClone(defaults);
    if (!patch || typeof patch !== "object") return base;
    const p = patch;
    if (typeof p.fallback === "string" && p.fallback.trim()) {
        base.fallback = p.fallback.trim();
    }
    if (p.pages && typeof p.pages === "object") {
        const pages = p.pages;
        for (const key of PAGE_HERO_KEYS){
            const v = pages[key];
            if (typeof v === "string" && v.trim()) base.pages[key] = v.trim();
        }
    }
    if (p.series && typeof p.series === "object") {
        const series = p.series;
        for (const [k, v] of Object.entries(series)){
            if (typeof v === "string" && v.trim()) base.series[k] = v.trim();
        }
    }
    return base;
}
function createDefaultPageBanners(apiUrl = __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_PUBLIC_ORIGINS"].api) {
    const config = structuredClone(DEFAULT_PAGE_BANNERS);
    const daima = apiUrl.replace(/\/+$/, "") + "/db/toei/189-DB-DAIMA-HP-Header-1920x595.png";
    config.series.DB_DAIMA = daima;
    config.series.DB_DAIMA_MOVIE = daima;
    return config;
}
}),
"[project]/packages/config/src/public-urls.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/**
 * Single source of truth for Shenron's public origins: site, bot API and the
 * asset/CDN base. Both apps used to resolve these with their own
 * `process.env.X ?? "https://…"` copies and divergent variable names
 * (`SITE_PUBLIC_URL`, `API_PUBLIC_URL`, `NEXT_PUBLIC_SHENRON_ASSETS_URL`, …).
 *
 * Each origin has ONE canonical server variable (`SHENRON_PUBLIC_*`); the
 * historical names stay accepted as read fallbacks, first non-empty wins:
 *
 * | origin | canonical                   | read order                                                                                   |
 * | ------ | --------------------------- | -------------------------------------------------------------------------------------------- |
 * | site   | `SHENRON_PUBLIC_SITE_URL`   | `NEXT_PUBLIC_SITE_URL`, canonical, `SITE_PUBLIC_URL`, `BETTER_AUTH_URL`                    |
 * | api    | `SHENRON_PUBLIC_API_URL`    | `NEXT_PUBLIC_SHENRON_API_URL`, canonical, `API_PUBLIC_URL`, `SHENRON_API_URL`              |
 * | assets | `SHENRON_PUBLIC_ASSETS_URL` | `NEXT_PUBLIC_SHENRON_ASSETS_URL`, canonical, then the api origin                           |
 *
 * The `NEXT_PUBLIC_*` mirror is read first because it is the value Next bakes
 * into client bundles: server and client must resolve the same origin.
 *
 * The production values are owned by the aphrody-infra service catalog; the
 * defaults below only keep a process without environment usable and are the
 * one place in the workspace allowed to spell them.
 *
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` on literal access, so the
 * resolvers take an explicit env record instead of reading a global: client
 * code passes its literal `process.env.NEXT_PUBLIC_…` values.
 *
 * Runtime class: `pure` (no global access).
 */ __turbopack_context__.s([
    "DEFAULT_DISCORD_INVITE",
    ()=>DEFAULT_DISCORD_INVITE,
    "DEFAULT_PUBLIC_ORIGINS",
    ()=>DEFAULT_PUBLIC_ORIGINS,
    "DEV_SITE_ORIGIN",
    ()=>DEV_SITE_ORIGIN,
    "DISCORD_CDN",
    ()=>DISCORD_CDN,
    "DISCORD_MEDIA_HOSTS",
    ()=>DISCORD_MEDIA_HOSTS,
    "PUBLIC_URL_ENV",
    ()=>PUBLIC_URL_ENV,
    "assetMirrorUrl",
    ()=>assetMirrorUrl,
    "canonicalDbzAssetUrl",
    ()=>canonicalDbzAssetUrl,
    "canonicalLegacyCdnAssetUrl",
    ()=>canonicalLegacyCdnAssetUrl,
    "discordDefaultAvatar",
    ()=>discordDefaultAvatar,
    "discordDefaultAvatarIndex",
    ()=>discordDefaultAvatarIndex,
    "discordDefaultAvatarUrl",
    ()=>discordDefaultAvatarUrl,
    "discordEmbedAvatar",
    ()=>discordEmbedAvatar,
    "discordGuildIcon",
    ()=>discordGuildIcon,
    "discordUserAvatar",
    ()=>discordUserAvatar,
    "discordUserBanner",
    ()=>discordUserBanner,
    "discordUserIdFromAvatarUrl",
    ()=>discordUserIdFromAvatarUrl,
    "joinUrl",
    ()=>joinUrl,
    "originOf",
    ()=>originOf,
    "ownImageRemotePatterns",
    ()=>ownImageRemotePatterns,
    "resolveApiUrl",
    ()=>resolveApiUrl,
    "resolveAssetsUrl",
    ()=>resolveAssetsUrl,
    "resolveAuthUrl",
    ()=>resolveAuthUrl,
    "resolveHostUrl",
    ()=>resolveHostUrl,
    "resolveSiteUrl",
    ()=>resolveSiteUrl
]);
const PUBLIC_URL_ENV = {
    site: [
        "NEXT_PUBLIC_SITE_URL",
        "SHENRON_PUBLIC_SITE_URL",
        "SITE_PUBLIC_URL",
        "BETTER_AUTH_URL"
    ],
    api: [
        "NEXT_PUBLIC_SHENRON_API_URL",
        "SHENRON_PUBLIC_API_URL",
        "API_PUBLIC_URL",
        "SHENRON_API_URL"
    ],
    assets: [
        "NEXT_PUBLIC_SHENRON_ASSETS_URL",
        "SHENRON_PUBLIC_ASSETS_URL"
    ],
    /** Origin of the Bun host (`shenron-server`) serving `/api/auth/*` and `/api/public/*`. */ host: [
        "SHENRON_HOST_URL"
    ]
};
const DEFAULT_PUBLIC_ORIGINS = {
    site: "https://dragonballfr.com",
    api: "https://bot.dragonballfr.com",
    /** Dedicated object-storage CDN for heavy assets (manga pages, wiki art). */ cdn: "https://cdn.dragonballfr.com"
};
const DEFAULT_DISCORD_INVITE = "https://discord.gg/dragonballfr";
const DEV_SITE_ORIGIN = "http://localhost:3000";
const trimSlash = (u)=>u.replace(/\/+$/, "");
function firstSet(env, names) {
    for (const name of names){
        const value = env[name]?.trim();
        if (value && value !== "undefined" && value !== "null") return trimSlash(value);
    }
    return undefined;
}
function resolveSiteUrl(env) {
    return firstSet(env, PUBLIC_URL_ENV.site) ?? DEFAULT_PUBLIC_ORIGINS.site;
}
function resolveHostUrl(env) {
    return firstSet(env, PUBLIC_URL_ENV.host);
}
function resolveAuthUrl(env) {
    return resolveHostUrl(env) ?? resolveSiteUrl(env);
}
function resolveApiUrl(env) {
    return firstSet(env, PUBLIC_URL_ENV.api) ?? DEFAULT_PUBLIC_ORIGINS.api;
}
function resolveAssetsUrl(env) {
    return firstSet(env, PUBLIC_URL_ENV.assets) ?? resolveApiUrl(env);
}
function canonicalDbzAssetUrl(source, assetsBase = DEFAULT_PUBLIC_ORIGINS.cdn, apiBase = DEFAULT_PUBLIC_ORIGINS.api, siteBase = DEFAULT_PUBLIC_ORIGINS.site) {
    const value = source.trim();
    const relative = /^(?:\.\/|\/)?assets\/dbz\//.test(value);
    if (!relative && !URL.canParse(value)) return null;
    const url = relative ? new URL(`/${value.replace(/^(?:\.\/|\/)/, "")}`, DEFAULT_PUBLIC_ORIGINS.site) : new URL(value);
    if (url.username || url.password || ![
        "http:",
        "https:"
    ].includes(url.protocol)) return null;
    const origins = [
        DEFAULT_PUBLIC_ORIGINS.cdn,
        DEFAULT_PUBLIC_ORIGINS.api,
        DEFAULT_PUBLIC_ORIGINS.site,
        assetsBase,
        apiBase,
        siteBase
    ].map(originOf);
    if (!relative && !origins.includes(url.origin)) return null;
    if (!url.pathname.startsWith("/assets/dbz/")) return null;
    const assets = originOf(assetsBase);
    const destination = [
        originOf(apiBase),
        originOf(siteBase)
    ].includes(assets) ? DEFAULT_PUBLIC_ORIGINS.cdn : assetsBase;
    return `${joinUrl(destination, url.pathname)}${url.search}${url.hash}`;
}
function canonicalLegacyCdnAssetUrl(source) {
    if (!URL.canParse(source)) return null;
    const url = new URL(source);
    if (url.origin !== "https://shenron-cdn.aphrody-labs.workers.dev" || url.username || url.password || !/^\/adn\/[a-f0-9]{64}\.png$/.test(url.pathname)) return null;
    return `${DEFAULT_PUBLIC_ORIGINS.cdn}${url.pathname}${url.search}${url.hash}`;
}
function joinUrl(base, path = "") {
    const b = trimSlash(base);
    return path ? `${b}/${path.replace(/^\/+/, "")}` : b;
}
function originOf(url) {
    try {
        return new URL(url).origin;
    } catch  {
        return url;
    }
}
function assetMirrorUrl(url, cdnOrigin = DEFAULT_PUBLIC_ORIGINS.cdn, apiOrigin = DEFAULT_PUBLIC_ORIGINS.api) {
    let u;
    try {
        u = new URL(url);
    } catch  {
        return null;
    }
    const cdn = new URL(cdnOrigin).host;
    const api = new URL(apiOrigin).host;
    if (u.host === cdn) u.host = api;
    else if (u.host === api) u.host = cdn;
    else return null;
    return u.toString();
}
const DISCORD_CDN = "https://cdn.discordapp.com";
/** A Discord snowflake: 64-bit integer written in base 10 (17 to 20 digits today). */ const DISCORD_SNOWFLAKE_RE = /^\d{15,21}$/;
function discordDefaultAvatarIndex(userId) {
    const id = userId?.trim();
    if (!id || !DISCORD_SNOWFLAKE_RE.test(id)) return null;
    return Number((BigInt(id) >> 22n) % 6n);
}
function discordDefaultAvatarUrl(userId) {
    const index = discordDefaultAvatarIndex(userId);
    return index === null ? null : discordEmbedAvatar(index);
}
function discordDefaultAvatar(userId) {
    return discordDefaultAvatarUrl(userId) ?? discordEmbedAvatar(0);
}
const DISCORD_MEDIA_HOSTS = [
    "cdn.discordapp.com",
    "media.discordapp.net"
];
function discordUserIdFromAvatarUrl(url) {
    if (!url) return null;
    let parsed;
    try {
        parsed = new URL(url);
    } catch  {
        return null;
    }
    if (!DISCORD_MEDIA_HOSTS.includes(parsed.hostname)) return null;
    const match = /^\/avatars\/(\d+)\//.exec(parsed.pathname) ?? /^\/guilds\/\d+\/users\/(\d+)\/avatars\//.exec(parsed.pathname);
    const id = match?.[1];
    return id && DISCORD_SNOWFLAKE_RE.test(id) ? id : null;
}
function patternFor(origin, pathname) {
    try {
        const u = new URL(origin);
        const protocol = u.protocol === "http:" ? "http" : "https";
        const base = u.pathname.replace(/\/+$/, "");
        return {
            protocol,
            hostname: u.hostname,
            pathname: `${base}${pathname}`
        };
    } catch  {
        return null;
    }
}
function ownImageRemotePatterns(env) {
    const api = resolveApiUrl(env);
    const site = resolveSiteUrl(env);
    const candidates = [
        patternFor(DEFAULT_PUBLIC_ORIGINS.cdn, "/assets/**"),
        patternFor(DEFAULT_PUBLIC_ORIGINS.cdn, "/dbz/**"),
        patternFor(DEFAULT_PUBLIC_ORIGINS.cdn, "/adn/*.png"),
        patternFor(resolveAssetsUrl(env), "/assets/**"),
        patternFor(resolveAssetsUrl(env), "/dbz/**"),
        patternFor(api, "/db/**"),
        patternFor(api, "/assets/**"),
        // Full Color pages: stable URL answering a 302 to Discord's signed CDN. The former
        // `/couleur/` path stays: the page URLs already stored in the database use it.
        patternFor(api, "/api/public/manga/color/**"),
        patternFor(api, "/api/public/manga/couleur/**"),
        patternFor(site, "/db/**"),
        patternFor(site, "/assets/**"),
        ...DISCORD_MEDIA_HOSTS.map((h)=>patternFor(`https://${h}`, "/**"))
    ];
    const seen = new Set();
    const out = [];
    for (const p of candidates){
        if (!p) continue;
        const key = `${p.protocol}://${p.hostname}${p.pathname}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
    }
    return out;
}
function discordGuildIcon(guildId, hash, opts = {}) {
    if (!hash) return null;
    return `${DISCORD_CDN}/icons/${guildId}/${hash}.${hash.startsWith("a_") ? "gif" : opts.fmt ?? "webp"}?size=${opts.size ?? 256}`;
}
function discordUserAvatar(userId, hash, opts = {}) {
    if (!hash) return discordDefaultAvatar(userId);
    const ext = hash.startsWith("a_") ? "gif" : opts.fmt ?? "webp";
    return `${DISCORD_CDN}/avatars/${userId}/${hash}.${ext}?size=${opts.size ?? 256}`;
}
function discordUserBanner(userId, hash, opts = {}) {
    if (!hash) return null;
    const ext = hash.startsWith("a_") ? "gif" : opts.fmt ?? "webp";
    return `${DISCORD_CDN}/banners/${userId}/${hash}.${ext}?size=${opts.size ?? 1024}`;
}
function discordEmbedAvatar(index) {
    return `${DISCORD_CDN}/embed/avatars/${index}.png`;
}
}),
"[project]/packages/config/src/services.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_INTERNAL_SERVICES",
    ()=>DEFAULT_INTERNAL_SERVICES,
    "DIRECT_CHAT_MODEL_ID",
    ()=>DIRECT_CHAT_MODEL_ID,
    "INTERNAL_SERVICE_ENV",
    ()=>INTERNAL_SERVICE_ENV,
    "resolveBotApiInternalUrl",
    ()=>resolveBotApiInternalUrl,
    "resolveBotApiServerUrl",
    ()=>resolveBotApiServerUrl,
    "resolveRedisUrl",
    ()=>resolveRedisUrl,
    "resolveRelectureOcrUrl",
    ()=>resolveRelectureOcrUrl,
    "resolveShenronApiBind",
    ()=>resolveShenronApiBind,
    "resolveSiteInternalUrl",
    ()=>resolveSiteInternalUrl
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Internal (loopback) service endpoints shared by the bot, the site and the
 * pipeline. Each resolver keeps the historical variable names; the defaults
 * are the local development addresses and the one place in the workspace
 * allowed to spell them. Production values come from the aphrody-infra
 * service catalog through the environment.
 *
 * | service        | read order                      | default                   |
 * | -------------- | ------------------------------- | ------------------------- |
 * | redis/valkey   | `REDIS_URL`, `VALKEY_URL`       | `redis://127.0.0.1:6379`  |
 * | site internal  | `SITE_INTERNAL_URL`             | `http://127.0.0.1:5011`   |
 * | bot API        | `API_HOST` + `API_PORT`         | `http://127.0.0.1:5006`   |
 * | bot API (site) | `BOT_INTERNAL_URL`              | public API URL            |
 * | relecture OCR  | `RELECTURE_OCR_URL`             | `http://127.0.0.1:8791`   |
 * | Shenron API    | `SHENRON_API_HOST` + `_PORT`    | `127.0.0.1:8797` (bind)   |
 *
 * The direct chat server (`APHRODY_AI_CHAT_BASE_URL`, read by `@aphrody/shenron-pipeline/ai/config`)
 * has no default address; only its default model id lives here.
 *
 * Runtime class: `pure` (takes an explicit env record).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/env.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/public-urls.ts [middleware] (ecmascript)");
;
;
const INTERNAL_SERVICE_ENV = {
    redis: [
        "REDIS_URL",
        "VALKEY_URL"
    ],
    siteInternal: [
        "SITE_INTERNAL_URL"
    ],
    botServer: [
        "BOT_INTERNAL_URL"
    ],
    relectureOcr: [
        "RELECTURE_OCR_URL"
    ]
};
const DEFAULT_INTERNAL_SERVICES = {
    redis: "redis://127.0.0.1:6379",
    siteInternal: "http://127.0.0.1:5011",
    botApiHost: "127.0.0.1",
    botApiPort: 5006,
    relectureOcr: "http://127.0.0.1:8791",
    shenronApiHost: "127.0.0.1",
    shenronApiPort: 8797
};
const DIRECT_CHAT_MODEL_ID = "gemma4-e2b";
const trimSlash = (u)=>u.replace(/\/+$/, "");
function resolveRedisUrl(env) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envFirst"])(env, INTERNAL_SERVICE_ENV.redis)?.value ?? DEFAULT_INTERNAL_SERVICES.redis;
}
function resolveSiteInternalUrl(env) {
    return trimSlash((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envFirst"])(env, INTERNAL_SERVICE_ENV.siteInternal)?.value ?? DEFAULT_INTERNAL_SERVICES.siteInternal);
}
function resolveBotApiInternalUrl(env) {
    const host = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envString"])(env, "API_HOST") ?? DEFAULT_INTERNAL_SERVICES.botApiHost;
    const port = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envString"])(env, "API_PORT") ?? String(DEFAULT_INTERNAL_SERVICES.botApiPort);
    return `http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${port}`;
}
function resolveBotApiServerUrl(env) {
    const internal = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envFirst"])(env, INTERNAL_SERVICE_ENV.botServer)?.value;
    return internal ? trimSlash(internal) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$public$2d$urls$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveApiUrl"])(env);
}
function resolveShenronApiBind(env) {
    const port = Number((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envString"])(env, "SHENRON_API_PORT"));
    return {
        hostname: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envString"])(env, "SHENRON_API_HOST") ?? DEFAULT_INTERNAL_SERVICES.shenronApiHost,
        port: Number.isInteger(port) && port > 0 && port < 65_536 ? port : DEFAULT_INTERNAL_SERVICES.shenronApiPort
    };
}
function resolveRelectureOcrUrl(env) {
    return trimSlash((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$env$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["envFirst"])(env, INTERNAL_SERVICE_ENV.relectureOcr)?.value ?? DEFAULT_INTERNAL_SERVICES.relectureOcr);
}
}),
"[project]/packages/config/src/site-theme.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/** Shared site palette defaults, validation and safe CSS serialization. Runtime class: pure. */ __turbopack_context__.s([
    "DEFAULT_SITE_THEME",
    ()=>DEFAULT_SITE_THEME,
    "THEME_COLOR_VARS",
    ()=>THEME_COLOR_VARS,
    "isDefaultTheme",
    ()=>isDefaultTheme,
    "resolveSiteTheme",
    ()=>resolveSiteTheme,
    "themeCssVars",
    ()=>themeCssVars
]);
const THEME_COLOR_VARS = {
    bg: "--dbz-bg",
    card: "--dbz-card",
    border: "--dbz-border",
    orange: "--dbz-orange",
    orangeDark: "--dbz-orange-dark",
    blue: "--dbz-blue",
    blueLight: "--dbz-blue-light",
    yellow: "--dbz-yellow",
    red: "--dbz-red",
    ember: "--dbz-ember",
    ki: "--dbz-ki",
    amber: "--dbz-amber"
};
const DEFAULT_SITE_THEME = {
    version: 1,
    colors: {
        bg: "#0a0a0a",
        card: "#141410",
        border: "#2a2a26",
        orange: "#e78220",
        orangeDark: "#c46f1b",
        blue: "#1e244d",
        blueLight: "#cdcdcd",
        yellow: "#fefd03",
        red: "#f10c3b",
        ember: "#ff6b1a",
        ki: "#4ba8ff",
        amber: "#ffd23f"
    },
    radius: 0.5
};
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const hex = (v, dflt)=>typeof v === "string" && HEX.test(v.trim()) ? v.trim() : dflt;
function resolveSiteTheme(patch) {
    if (!patch || typeof patch !== "object") return DEFAULT_SITE_THEME;
    const p = patch;
    const cp = p.colors ?? {};
    const colors = {};
    for (const key of Object.keys(THEME_COLOR_VARS)){
        colors[key] = hex(cp[key], DEFAULT_SITE_THEME.colors[key]);
    }
    const r = typeof p.radius === "number" ? p.radius : Number(p.radius);
    const radius = Number.isFinite(r) ? Math.max(0, Math.min(2, r)) : DEFAULT_SITE_THEME.radius;
    return {
        version: 1,
        colors,
        radius
    };
}
function isDefaultTheme(theme) {
    if (theme.radius !== DEFAULT_SITE_THEME.radius) return false;
    return Object.keys(THEME_COLOR_VARS).every((k)=>theme.colors[k].toLowerCase() === DEFAULT_SITE_THEME.colors[k].toLowerCase());
}
function themeCssVars(theme) {
    if (isDefaultTheme(theme)) return "";
    const parts = [];
    for (const key of Object.keys(THEME_COLOR_VARS)){
        parts.push(`${THEME_COLOR_VARS[key]}:${theme.colors[key]}`);
    }
    parts.push(`--radius:${theme.radius}rem`);
    return parts.join(";");
}
}),
"[project]/packages/config/src/wiki-launch-config.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_LAUNCH_CONFIG",
    ()=>DEFAULT_LAUNCH_CONFIG,
    "resolveLaunchConfig",
    ()=>resolveLaunchConfig
]);
// SPDX-License-Identifier: Apache-2.0
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/config/src/wiki-launch.ts [middleware] (ecmascript)");
;
/** Clés valides ouvrables (garde-fou contre des clés obsolètes en base). */ const GATEABLE_KEYS = new Set(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["GATEABLE_CATEGORIES"].map((c)=>c.key));
const KNOWN_KEYS = new Set(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ALL_ENTRIES"].map((e)=>e.key));
const ALWAYS_OPEN = new Set(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ALWAYS_OPEN_KEYS"]);
const MODES = new Set([
    "public",
    "members",
    "roles",
    "admin"
]);
/** Clés lues en base, anciennes clés françaises ramenées à la clé actuelle. */ function currentKeys(arr) {
    return arr.filter((k)=>typeof k === "string").map(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["currentEntryKey"]);
}
function sanitizeOpenKeys(stored) {
    const arr = Array.isArray(stored?.openKeys) ? stored.openKeys : [];
    const extra = currentKeys(arr).filter((k)=>GATEABLE_KEYS.has(k));
    // alwaysOpen toujours inclus ; dédoublonné.
    return Array.from(new Set([
        ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["ALWAYS_OPEN_KEYS"],
        ...extra
    ]));
}
function sanitizeOrder(stored) {
    const arr = Array.isArray(stored?.order) ? stored.order : [];
    return Array.from(new Set(currentKeys(arr).filter((k)=>KNOWN_KEYS.has(k))));
}
function sanitizeAccess(stored) {
    const raw = stored?.access;
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    // Une règle enregistrée sous la clé actuelle l'emporte sur celle de l'ancienne clé
    // française : les anciennes passent d'abord, les actuelles les écrasent.
    const entries = Object.entries(raw).map(([storedKey, value])=>({
            stored: storedKey,
            key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["currentEntryKey"])(storedKey),
            value
        })).toSorted((a, b)=>Number(a.stored === a.key) - Number(b.stored === b.key));
    for (const { key, value } of entries){
        // Clé obsolète, ou rubrique verrouillée publique (bêta) → on ignore la règle
        // plutôt que de la persister : elle ne serait jamais appliquée.
        if (!KNOWN_KEYS.has(key) || ALWAYS_OPEN.has(key)) continue;
        const mode = value?.mode;
        if (typeof mode !== "string" || !MODES.has(mode)) continue;
        const ids = Array.isArray(value?.roleIds) ? value.roleIds : [];
        const roleIds = Array.from(new Set(ids.filter((r)=>typeof r === "string" && /^\d{17,20}$/.test(r))));
        // Mode « rôles » sans aucun rôle = piège à trou de sécurité inverse (personne
        // ne passe, y compris le staff qui croyait avoir ouvert) → on retombe sur
        // « connectés », intention la plus proche.
        out[key] = {
            mode: mode === "roles" && roleIds.length === 0 ? "members" : mode,
            roleIds
        };
    }
    return out;
}
function resolveLaunchConfig(stored) {
    return {
        openKeys: sanitizeOpenKeys(stored),
        order: sanitizeOrder(stored),
        access: sanitizeAccess(stored)
    };
}
const DEFAULT_LAUNCH_CONFIG = {
    openKeys: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$config$2f$src$2f$wiki$2d$launch$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEFAULT_OPEN_KEYS"],
    order: [],
    access: {}
};
}),
"[project]/packages/config/src/wiki-launch.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/**
 * Registre de LANCEMENT du wiki (client-safe — aucun import server-only).
 *
 * Chaque catégorie mappe vers ses **préfixes d'URL** (index + routes détail) qui
 * doivent être ouverts ENSEMBLE quand on la publie. Le gating (`proxy.ts`), la nav
 * (`SiteNav`) et le teaser (`/coming-soon`) résolvent tous « catégorie ouverte ? »
 * via ce registre + l'ensemble des clés ouvertes (DB, `wiki-launch-config.ts`).
 *
 * `alwaysOpen` = catégories déjà publiques en bêta (episodes/films/manga/chrono) :
 * elles ne peuvent pas être refermées depuis l'admin (garde-fou).
 */ /**
 * Qui a le droit de voir une entrée :
 *   public  → tout le monde, y compris les moteurs de recherche
 *   members → visiteurs connectés (compte Discord lié)
 *   roles   → connectés portant AU MOINS UN des `roleIds` sur le serveur Discord
 *   admin   → staff du site uniquement (équivaut à « fermé »)
 */ __turbopack_context__.s([
    "ALL_ENTRIES",
    ()=>ALL_ENTRIES,
    "ALWAYS_OPEN_KEYS",
    ()=>ALWAYS_OPEN_KEYS,
    "DEFAULT_OPEN_KEYS",
    ()=>DEFAULT_OPEN_KEYS,
    "GATEABLE_CATEGORIES",
    ()=>GATEABLE_CATEGORIES,
    "LAUNCH_CATEGORIES",
    ()=>LAUNCH_CATEGORIES,
    "LEGACY_ENTRY_KEYS",
    ()=>LEGACY_ENTRY_KEYS,
    "SITE_SECTIONS",
    ()=>SITE_SECTIONS,
    "currentEntryKey",
    ()=>currentEntryKey,
    "effectiveOpenKeys",
    ()=>effectiveOpenKeys,
    "entryByKey",
    ()=>entryByKey,
    "findEntry",
    ()=>findEntry,
    "isPathPublic",
    ()=>isPathPublic,
    "orderedEntries",
    ()=>orderedEntries,
    "publicEntries",
    ()=>publicEntries,
    "resolveAccess",
    ()=>resolveAccess
]);
const LAUNCH_CATEGORIES = [
    // ── Déjà ouvertes en bêta (verrouillées ON) ──────────────────────────────
    {
        key: "episodes",
        label: "Épisodes",
        href: "/wiki/episodes",
        prefixes: [
            "/wiki/episodes"
        ],
        alwaysOpen: true,
        group: "oeuvres",
        blurb: "826 épisodes, de Dragon Ball à Daima"
    },
    {
        key: "movies",
        label: "Films",
        href: "/wiki/movies",
        prefixes: [
            "/wiki/movies"
        ],
        alwaysOpen: true,
        group: "oeuvres",
        blurb: "Longs métrages et OAV"
    },
    {
        key: "timeline",
        label: "Chronologie",
        href: "/wiki/timeline",
        prefixes: [
            "/wiki/timeline"
        ],
        alwaysOpen: true,
        group: "oeuvres",
        blurb: "La frise complète de l'univers"
    },
    {
        key: "manga",
        label: "Manga",
        href: "/wiki/manga",
        prefixes: [
            "/wiki/manga"
        ],
        alwaysOpen: true,
        group: "archives",
        blurb: "Les planches, tome par tome"
    },
    // ── Fermées par défaut, ouvrables une par une depuis /admin/launch ─────────
    //
    // Chaque rubrique garde son ANCIEN préfixe `/wiki/dragon-ball/…` en second :
    // les fiches ont été rapatriées sous le segment de leur index (`/wiki/characters/12`
    // et non `/wiki/dragon-ball/character/12`), et le 308 de `next.config` récupère
    // les URL déjà indexées. Sans le préfixe historique ici, une vieille URL d'une
    // rubrique fermée qui atteindrait le proxy traverserait le gating. Les anciens
    // segments français (`/wiki/personnages`…) n'ont pas besoin d'y figurer : le proxy
    // les renvoie en 308 (`lib/legacy-routes.ts`) avant de consulter ce registre.
    {
        // Compatibilité uniquement : la rubrique n'est plus proposée dans la
        // navigation, mais ses anciennes URLs doivent atteindre la redirection
        // `/wiki/locations` au lieu d'être bloquées par le proxy.
        key: "planets",
        label: "Cosmologie (archive)",
        href: null,
        prefixes: [
            "/wiki/cosmologie",
            "/wiki/planetes",
            "/wiki/dragon-ball/planet"
        ],
        alwaysOpen: true
    },
    {
        key: "characters",
        label: "Personnages",
        href: "/wiki/characters",
        prefixes: [
            "/wiki/characters",
            "/wiki/dragon-ball/character"
        ],
        group: "wiki",
        blurb: "1 300 fiches, du Saiyan au Kaïō"
    },
    {
        key: "races",
        label: "Races",
        href: "/wiki/races",
        prefixes: [
            "/wiki/races"
        ],
        group: "wiki",
        blurb: "Peuples et espèces de l'univers"
    },
    {
        key: "transformations",
        label: "Transformations",
        href: "/wiki/transformations",
        prefixes: [
            "/wiki/transformations"
        ],
        group: "wiki",
        blurb: "États et métamorphoses"
    },
    {
        key: "techniques",
        label: "Techniques",
        href: "/wiki/techniques",
        prefixes: [
            "/wiki/techniques",
            "/wiki/dragon-ball/techniques"
        ],
        group: "wiki",
        blurb: "Attaques, sorts et déplacements"
    },
    {
        key: "sagas",
        label: "Sagas",
        href: "/wiki/sagas",
        prefixes: [
            "/wiki/sagas"
        ],
        group: "wiki",
        blurb: "Les grands arcs du récit"
    },
    {
        key: "games",
        label: "Jeux",
        href: "/wiki/games",
        prefixes: [
            "/wiki/games",
            "/wiki/dragon-ball/games"
        ],
        group: "oeuvres",
        blurb: "Adaptations vidéoludiques"
    },
    {
        key: "databooks",
        label: "Databooks",
        href: "/wiki/databooks",
        prefixes: [
            "/wiki/databooks"
        ],
        group: "archives",
        blurb: "Daizenshuu, Chōzenshū et artbooks officiels"
    },
    // L'espace Bibliothèque (`lib/library.ts`) : manga et databooks ci-dessus, puis
    // l'atelier (avancement public, outils staff gardés par le proxy) et l'éditeur Shenron Studio.
    {
        key: "workshop",
        label: "Transcription et traduction",
        href: "/workshop",
        prefixes: [
            "/workshop"
        ],
        alwaysOpen: true,
        scope: "site",
        defaultMode: "public",
        group: "archives",
        blurb: "Où en sont les planches du manga et des databooks"
    },
    {
        key: "studio",
        label: "Shenron Studio",
        href: "/studio",
        prefixes: [
            "/studio"
        ],
        alwaysOpen: true,
        scope: "site",
        defaultMode: "public",
        group: "archives",
        blurb: "L'éditeur de traduction manga de Shenron"
    },
    {
        key: "power-levels",
        label: "Puissances & Scouter",
        href: "/wiki/power-levels",
        prefixes: [
            "/wiki/power-levels"
        ],
        group: "wiki",
        blurb: "Niveaux de combat officiels et multiplicateurs"
    },
    {
        key: "items",
        label: "Objets & Technologies",
        href: "/wiki/items",
        prefixes: [
            "/wiki/items"
        ],
        group: "wiki",
        blurb: "Capsules, reliques, armes et véhicules"
    },
    {
        key: "locations",
        label: "Lieux & Sanctuaires",
        href: "/wiki/locations",
        prefixes: [
            "/wiki/locations"
        ],
        group: "wiki",
        blurb: "Géographie mythique, sanctuaires et planètes"
    },
    {
        key: "events",
        label: "Événements",
        href: "/wiki/events",
        prefixes: [
            "/wiki/events"
        ],
        alwaysOpen: true,
        group: "oeuvres",
        blurb: "Combats, tournois et jalons du récit dans une même chronologie"
    },
    {
        key: "music",
        label: "Musiques & OST",
        href: "/wiki/music",
        prefixes: [
            "/wiki/music"
        ],
        group: "oeuvres",
        blurb: "Génériques, OST orchestrales et insert songs cultes"
    },
    // Outils communautaires (43 dépôts GitHub : modding, shaders, API).
    {
        key: "tools",
        label: "Outils & Modding",
        href: "/wiki/tools",
        prefixes: [
            "/wiki/tools"
        ],
        alwaysOpen: true,
        group: "communaute",
        blurb: "Modding, shaders, émulateurs et API communautaires"
    },
    {
        key: "corrections",
        label: "Corriger",
        href: null,
        prefixes: [
            "/wiki/corrections"
        ],
        alwaysOpen: true,
        defaultMode: "public"
    },
    {
        // Le flux public des révisions du wiki a été retiré le 2026-09-12 : il
        // racontait la fabrication du site. L'entrée du registre reste, sans `href`
        // ni `group` — donc absente de la nav, du pied de page et du plan du site —
        // uniquement pour que `/wiki/modifications` (qui redirige) et `/news/feed`
        // (le fil public) continuent d'être traités comme publics par le gating.
        key: "feed",
        label: "Fil d'actualité",
        href: null,
        prefixes: [
            "/wiki/modifications",
            "/news/feed"
        ],
        alwaysOpen: true,
        defaultMode: "public"
    },
    {
        key: "contribute",
        label: "Contribuer",
        href: "/wiki/contribute",
        prefixes: [
            "/wiki/contribute"
        ],
        alwaysOpen: true,
        defaultMode: "public",
        group: "communaute",
        blurb: "Rejoindre l'effort de documentation et proposer des corrections"
    },
    {
        key: "toriyama-archives",
        label: "Canon",
        href: "/wiki/canon",
        prefixes: [
            "/wiki/canon",
            "/wiki/guide-officiel-power-scaling-sentoryoku-kiri",
            "/wiki/structure-du-macrocosme-univers-7",
            "/wiki/hierarchie-divine-dragon-ball",
            "/wiki/chronologie-canonique-univers-7",
            "/wiki/histoire-et-physiologie-des-saiyans",
            "/wiki/mecanique-du-ki-et-du-combat",
            "/wiki/guide-reference-databooks-officiels",
            "/wiki/akira-toriyama-tankobon-introductions",
            "/wiki/doctrine-artistique-akira-toriyama",
            "/wiki/archives-akira-toriyama"
        ],
        alwaysOpen: true,
        defaultMode: "public",
        group: "archives",
        blurb: "Doctrine de canonicité et sources vérifiées"
    },
    {
        key: "interviews",
        label: "Interviews",
        href: "/wiki/interviews",
        prefixes: [
            "/wiki/interviews",
            "/wiki/manga/interviews"
        ],
        alwaysOpen: true,
        defaultMode: "public",
        group: "archives",
        blurb: "Entretiens, lettres d'auteur et introductions, cités à la source"
    },
    {
        // Les paroles de l'auteur avaient trois domiciles (corpus canon, interviews
        // du catalogue, introductions de tomes) et aucune page à elles. Elles en ont
        // une seule désormais, déclarée ici pour apparaître d'un coup dans la nav, le
        // pied de page, le menu mobile, le plan du site et le sitemap.
        key: "toriyama-words",
        label: "Les mots de Toriyama",
        href: "/wiki/toriyama",
        prefixes: [
            "/wiki/toriyama"
        ],
        alwaysOpen: true,
        defaultMode: "public",
        group: "archives",
        blurb: "Interviews, lettres d'auteur et introductions de tomes, citées à la source"
    },
    {
        key: "staff",
        label: "Staff & Contributeurs",
        href: "/wiki/staff",
        prefixes: [
            "/wiki/staff",
            "/wiki/contributors"
        ],
        alwaysOpen: true,
        defaultMode: "public",
        group: "archives",
        blurb: "Les bâtisseurs et artisans de l'univers Dragon Ball (auteurs, éditeurs, animateurs, compositeurs)"
    }
];
const SITE_SECTIONS = [
    {
        key: "tierlists",
        label: "Tier lists",
        href: "/tierlists",
        prefixes: [
            "/tierlists"
        ],
        scope: "site",
        defaultMode: "admin",
        group: "communaute",
        blurb: "Créer, voter et partager ses classements"
    },
    {
        key: "rankings",
        label: "Classements",
        href: "/rankings",
        prefixes: [
            "/rankings",
            "/leaderboard"
        ],
        scope: "site",
        defaultMode: "public",
        group: "communaute",
        blurb: "Les tops de score et records de la communauté"
    },
    {
        key: "shop",
        label: "Boutique",
        href: "/shop",
        prefixes: [
            "/shop"
        ],
        scope: "site",
        defaultMode: "public",
        group: "communaute",
        blurb: "Cosmétiques, titres et récompenses en zénis"
    },
    {
        key: "games-hub",
        label: "Mini-jeux",
        href: "/games",
        prefixes: [
            "/games"
        ],
        scope: "site",
        defaultMode: "public",
        group: "communaute",
        blurb: "Arène, 2048, Bingo, Morpion et PFC"
    },
    {
        key: "news",
        label: "News & Actualités",
        href: "/news",
        prefixes: [
            "/news",
            "/actualites"
        ],
        scope: "site",
        defaultMode: "public",
        group: "communaute",
        blurb: "L'actualité de la licence et les sorties du moment"
    },
    // (Ancienne section « Articles communautaires » sur /post : supprimée avec la
    // route. Les articles vivent sous /actualites, déjà couvert par l'entrée
    // ci-dessus, et /post/:slug est redirigé en 308 au niveau du routing — donc
    // avant même que ce registre soit consulté.)
    {
        key: "assistant",
        label: "Assistant IA",
        href: "/ask",
        prefixes: [
            "/ask"
        ],
        scope: "site",
        defaultMode: "public"
    },
    {
        key: "canvas",
        label: "Canvas",
        href: "/canvas",
        prefixes: [
            "/canvas"
        ],
        scope: "site",
        defaultMode: "public"
    },
    {
        // Sans entrée ici, `/wiki/random` retomberait sur le défaut « sous /wiki,
        // fermé » du proxy et redirigerait vers /coming-soon. La route ne fait
        // elle-même que rediriger vers une rubrique OUVERTE (elle relit ce même
        // registre) : l'ouvrir n'expose donc rien de fermé.
        key: "random",
        label: "Au hasard",
        href: "/wiki/random",
        prefixes: [
            "/wiki/random"
        ],
        scope: "site",
        defaultMode: "public"
    },
    {
        // La recherche n'avait AUCUNE entrée au registre : `/wiki/search` retombait
        // donc sur le défaut « sous /wiki, fermé » et redirigeait tout anonyme vers
        // /coming-soon — alors que `SiteJsonLd` annonce à Google une sitelinks
        // searchbox pointant précisément cette URL, et que la palette ⌘K s'appuie
        // dessus. La page est `noindex, follow` : elle n'ajoute pas de contenu
        // mince à l'index, elle sert la découverte.
        key: "search",
        label: "Recherche",
        href: "/wiki/search",
        prefixes: [
            "/wiki/search"
        ],
        scope: "site",
        defaultMode: "public"
    },
    {
        key: "stats",
        label: "Statistiques",
        href: "/stats",
        prefixes: [
            "/stats"
        ],
        scope: "site",
        defaultMode: "public"
    },
    {
        key: "personas",
        label: "Personas",
        href: "/personas",
        prefixes: [
            "/personas"
        ],
        scope: "site",
        defaultMode: "public"
    },
    {
        key: "commands",
        label: "Commandes du bot",
        href: "/commands",
        prefixes: [
            "/commands"
        ],
        scope: "site",
        defaultMode: "public"
    },
    {
        key: "profile",
        label: "Profil joueur",
        href: "/profile",
        prefixes: [
            "/profile"
        ],
        scope: "site",
        defaultMode: "public"
    }
];
const ALL_ENTRIES = [
    ...LAUNCH_CATEGORIES,
    ...SITE_SECTIONS
];
const BY_KEY = new Map(ALL_ENTRIES.map((e)=>[
        e.key,
        e
    ]));
const LEGACY_ENTRY_KEYS = {
    films: "movies",
    chronologie: "timeline",
    planetes: "planets",
    personnages: "characters",
    jeux: "games",
    koharu: "studio",
    atelier: "workshop",
    puissances: "power-levels",
    objets: "items",
    lieux: "locations",
    evenements: "events",
    musiques: "music",
    corriger: "corrections",
    modifications: "feed",
    contribuer: "contribute",
    "toriyama-paroles": "toriyama-words",
    classements: "rankings",
    boutique: "shop",
    "jeux-hub": "games-hub",
    hasard: "random",
    recherche: "search",
    commandes: "commands",
    profil: "profile"
};
function currentEntryKey(key) {
    return BY_KEY.has(key) ? key : LEGACY_ENTRY_KEYS[key] ?? key;
}
function entryByKey(key) {
    return BY_KEY.get(key) ?? BY_KEY.get(LEGACY_ENTRY_KEYS[key] ?? "");
}
function findEntry(pathname) {
    let best;
    let bestLen = -1;
    for (const e of ALL_ENTRIES){
        for (const p of e.prefixes){
            if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > bestLen) {
                best = e;
                bestLen = p.length;
            }
        }
    }
    return best;
}
function resolveAccess(key, cfg) {
    const entry = BY_KEY.get(key);
    if (entry?.alwaysOpen) return {
        mode: "public",
        roleIds: []
    };
    const stored = cfg.access?.[key];
    if (stored) return stored;
    if (entry?.scope === "site") return {
        mode: entry.defaultMode ?? "public",
        roleIds: []
    };
    return {
        mode: cfg.openKeys.includes(key) ? "public" : "admin",
        roleIds: []
    };
}
function orderedEntries(order, entries = ALL_ENTRIES) {
    const rank = new Map(order.map((k, i)=>[
            k,
            i
        ]));
    return [
        ...entries
    ].toSorted((a, b)=>{
        const ra = rank.get(a.key) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.key) ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return entries.indexOf(a) - entries.indexOf(b);
    });
}
const ALWAYS_OPEN_KEYS = LAUNCH_CATEGORIES.filter((c)=>c.alwaysOpen).map((c)=>c.key);
const DEFAULT_OPEN_KEYS = ALWAYS_OPEN_KEYS;
const GATEABLE_CATEGORIES = LAUNCH_CATEGORIES.filter((c)=>!c.alwaysOpen);
function effectiveOpenKeys(stored) {
    return new Set([
        ...ALWAYS_OPEN_KEYS,
        ...stored
    ]);
}
function isPathPublic(pathname, cfg) {
    // `/wiki` exactement = le sommaire, public (cf. `proxy.ts`, même règle).
    if (pathname === "/wiki") return true;
    const entry = findEntry(pathname);
    if (!entry) return !pathname.startsWith("/wiki/");
    return resolveAccess(entry.key, cfg).mode === "public";
}
function publicEntries(cfg) {
    return ALL_ENTRIES.filter((e)=>resolveAccess(e.key, cfg).mode === "public");
}
}),
"[project]/packages/db/src/bot-schema.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "bot",
    ()=>bot,
    "botArcs",
    ()=>botArcs,
    "botAssets",
    ()=>botAssets,
    "botBattles",
    ()=>botBattles,
    "botCharacterArcs",
    ()=>botCharacterArcs,
    "botCharacterTechniques",
    ()=>botCharacterTechniques,
    "botCharacterVariants",
    ()=>botCharacterVariants,
    "botCharacters",
    ()=>botCharacters,
    "botContributorCredits",
    ()=>botContributorCredits,
    "botContributors",
    ()=>botContributors,
    "botDatabooks",
    ()=>botDatabooks,
    "botDragonballcnVolumes",
    ()=>botDragonballcnVolumes,
    "botDragons",
    ()=>botDragons,
    "botEpisodes",
    ()=>botEpisodes,
    "botGameCharacters",
    ()=>botGameCharacters,
    "botGames",
    ()=>botGames,
    "botItems",
    ()=>botItems,
    "botLicenses",
    ()=>botLicenses,
    "botLocations",
    ()=>botLocations,
    "botMangaChapters",
    ()=>botMangaChapters,
    "botMangaPages",
    ()=>botMangaPages,
    "botMangaVolumes",
    ()=>botMangaVolumes,
    "botMediaChapters",
    ()=>botMediaChapters,
    "botMediaEditionAliases",
    ()=>botMediaEditionAliases,
    "botMediaEditions",
    ()=>botMediaEditions,
    "botMediaPageAssets",
    ()=>botMediaPageAssets,
    "botMediaPageRefs",
    ()=>botMediaPageRefs,
    "botMediaPublications",
    ()=>botMediaPublications,
    "botMediaVolumes",
    ()=>botMediaVolumes,
    "botMediaWorks",
    ()=>botMediaWorks,
    "botMovies",
    ()=>botMovies,
    "botNarrativeEventAliases",
    ()=>botNarrativeEventAliases,
    "botNarrativeEventParticipants",
    ()=>botNarrativeEventParticipants,
    "botNarrativeEventRelations",
    ()=>botNarrativeEventRelations,
    "botNarrativeEvents",
    ()=>botNarrativeEvents,
    "botNarrativeTimelines",
    ()=>botNarrativeTimelines,
    "botNews",
    ()=>botNews,
    "botPlanets",
    ()=>botPlanets,
    "botPowerLevels",
    ()=>botPowerLevels,
    "botRaces",
    ()=>botRaces,
    "botSagas",
    ()=>botSagas,
    "botSoundtracks",
    ()=>botSoundtracks,
    "botSources",
    ()=>botSources,
    "botTechniques",
    ()=>botTechniques,
    "botTimelineEvents",
    ()=>botTimelineEvents,
    "botTools",
    ()=>botTools,
    "botTournaments",
    ()=>botTournaments,
    "botTransformations",
    ()=>botTransformations,
    "botVoiceActors",
    ()=>botVoiceActors,
    "botWikiSections",
    ()=>botWikiSections,
    "botWishes",
    ()=>botWishes
]);
/**
 * Schéma Drizzle du **wiki Dragon Ball**, schéma PostgreSQL `bot`.
 *
 * Source de vérité = PostgreSQL local (`shenron_site`, schéma `bot`). Le SQLite
 * du bot (`apps/bot/data/bot.db`) n'est qu'un réplica partiel (ni `article`,
 * ni `visible`, ni sections/références canon/databooks) : toute indexation
 * lit PostgreSQL. L'ancien miroir Neon (timer `shenron-neon-sync`) est retiré.
 * Ce schéma est generate-only : `apps/site/drizzle.config.bot.ts` refuse
 * `push` et `migrate`.
 *
 * Le site lit le wiki **directement ici via Drizzle** (plus de fetch sur l'API
 * REST du bot pour les pages publiques /wiki) → découplé de la dispo du process
 * bot. Toutes les colonnes int SQLite arrivent en `bigint` Postgres, les autres
 * en `text` — on type donc à l'identique. Lecture seule : aucune écriture site.
 *
 * ── INDEX : voir `apps/site/src/db/bot-indexes.sql` ─────────────────────────
 * Les index de ce schéma ne sont volontairement PAS déclarés ici. Ce fichier
 * n'ayant jamais porté d'`index()`, les tables du wiki n'ont longtemps eu que
 * leur clé primaire (deux tables de jointure n'avaient même pas ça) : mesuré le
 * 2026-08-21, 272 000 balayages séquentiels sur `db_episodes`, 76 000 sur
 * `db_manga_chapters`. Ils vivent désormais dans `bot-indexes.sql`, appliqué par
 * `apps/site/scripts/apply-bot-indexes.ts`.
 *
 * Pourquoi pas ici : les index qui comptent sont des index PARTIELS
 * (`WHERE visible`) et des GIN `gin_trgm_ops`, que drizzle-kit ne restitue pas
 * fidèlement. Les déclarer produirait un écart permanent au diff — et donc une
 * invitation à lancer un `push` sur le schéma `bot`, qui voudrait droper les
 * colonnes propres à PostgreSQL (`players`, `frames`, `pages`, `subtitles`).
 * Toute modification d'index passe par le fichier SQL, pas par ce fichier.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$bigint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/bigint.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/boolean.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/integer.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/jsonb.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$numeric$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/numeric.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$schema$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/schema.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/text.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/timestamp.js [middleware] (ecmascript)");
;
const bot = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$schema$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgSchema"])("bot");
/** bigint Neon → number JS (les ID wiki sont petits, < 2^53). */ const int = (name)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$bigint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["bigint"])(name, {
        mode: "number"
    });
/** Trois colonnes communes aux tables éditoriales recevant un article long-format. */ const articleCols = {
    article: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("article"),
    articleSources: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("article_sources").$type(),
    articleUpdatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$bigint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["bigint"])("article_updated_at", {
        mode: "number"
    })
};
/**
 * Visibilité éditoriale (PG-only) — masque une entité du site public sans la
 * supprimer. Défaut `true`. Comme `articleCols`, colonne posée uniquement sur
 * Postgres (`scripts/add-wiki-visibility.ts`) : le forward-sync exclut ces tables
 * éditoriales et le reverse-sync l'ignore (intersection de colonnes). Les lectures
 * publiques filtrent `visible = true` ; l'admin la bascule via `/api/wiki-visibility`.
 */ const visibleCol = {
    visible: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("visible").notNull().default(true)
};
const botCharacters = bot.table("db_characters", {
    id: int("id").primaryKey(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    portraitXv2: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("portrait_xv2"),
    ki: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("ki"),
    maxKi: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("max_ki"),
    race: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("race"),
    gender: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("gender"),
    affiliation: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("affiliation"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    originPlanetId: int("origin_planet_id"),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    nameRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_romaji"),
    /** Première apparition (épisodes / chapitres / saga). */ debutEpisodeId: int("debut_episode_id"),
    debutChapterId: int("debut_chapter_id"),
    debutSagaId: int("debut_saga_id"),
    /** Stats custom scouter (jsonb) — CharacterStatsPanel. */ stats: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("stats").$type(),
    ...articleCols,
    ...visibleCol
});
const botPlanets = bot.table("db_planets", {
    id: int("id").primaryKey(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    isDestroyed: int("is_destroyed"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    nameRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_romaji"),
    ...articleCols,
    ...visibleCol
});
const botTransformations = bot.table("db_transformations", {
    id: int("id").primaryKey(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    ki: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("ki"),
    characterId: int("character_id"),
    ...articleCols,
    ...visibleCol
});
const botRaces = bot.table("db_races", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    homePlanetId: int("home_planet_id"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    ...articleCols,
    ...visibleCol
});
const botTechniques = bot.table("db_techniques", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    nameRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_romaji"),
    type: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("type"),
    creatorId: int("creator_id"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    /**
   * Illustration. Peuplée depuis le catalogue Xenoverse 2 : le portrait d'un
   * personnage qui pratique la technique DANS LE JEU (594 des 825 fiches).
   * Ce n'est pas une attribution — `creator_id` reste ce qu'une phrase de
   * databook a établi, et rien d'autre.
   */ image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    debutEpisodeId: int("debut_episode_id"),
    debutChapterId: int("debut_chapter_id"),
    ...articleCols,
    ...visibleCol
});
const botCharacterTechniques = bot.table("db_character_techniques", {
    characterId: int("character_id").notNull(),
    techniqueId: int("technique_id").notNull()
});
const botSagas = bot.table("db_sagas", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    series: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("series"),
    orderIdx: int("order_idx"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    /**
   * Bornes de la saga dans le manga (PG-only, `scripts/add-character-variants.ts`).
   * Ce sont elles qui rendent la présence d'un personnage MESURABLE : sans
   * plage de tomes, « Goku apparaît-il dans la saga Namek ? » n'a aucune
   * réponse dans la base, seulement dans la tête de celui qui la remplit.
   * Renseignées pour le manga 42 tomes (`bornes-sagas-manga.ts`) ; NULL pour
   * les sagas sans support manga (GT, Daima, films, épisodes spéciaux).
   */ mangaVolumeStart: int("manga_volume_start"),
    mangaVolumeEnd: int("manga_volume_end"),
    mangaChapterStart: int("manga_chapter_start"),
    mangaChapterEnd: int("manga_chapter_end"),
    /**
   * Bornes de la saga dans la série animée — la seconde source mesurable, et
   * la SEULE pour les 18 sagas sans manga (GT, Daima, DBS anime, films).
   * `episodeSeries` est indispensable : la numérotation repart à 1 dans chaque
   * série, DBZ #1 n'a rien à voir avec DBGT #1.
   */ episodeSeries: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("episode_series"),
    episodeStart: int("episode_start"),
    episodeEnd: int("episode_end"),
    ...articleCols,
    ...visibleCol
});
const botArcs = bot.table("db_arcs", {
    id: int("id").primaryKey(),
    sagaId: int("saga_id"),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    orderIdx: int("order_idx"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    ...articleCols,
    ...visibleCol
});
const botCharacterArcs = bot.table("db_character_arcs", {
    characterId: int("character_id").notNull(),
    arcId: int("arc_id").notNull(),
    note: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("note"),
    appearanceImage: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("appearance_image")
});
const botCharacterVariants = bot.table("db_character_variants", {
    id: int("id").primaryKey(),
    characterId: int("character_id").notNull(),
    sagaId: int("saga_id").notNull(),
    /** Ancre stable dans l'URL de la fiche (ex. `goku-namek`). */ slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    /** Libellé de la pilule dans la frise (ex. « Saga Namek »). */ label: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("label").notNull(),
    /** Nom affiché en tête de la variante (ex. « Son Goku — Saga Namek »). */ displayName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("display_name"),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    /** Forme atteinte à cette période (« Super Saiyan », « Ôzaru »…). */ form: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("form"),
    /** Apparence propre à la saga ; NULL → image de la fiche. */ image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    /** Âge du personnage à cette période, quand une source le donne. */ age: int("age"),
    /** Puissance telle qu'une source la chiffre (databook, scouter) — texte. */ powerLevel: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("power_level"),
    ki: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("ki"),
    maxKi: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("max_ki"),
    /** Rôle tenu dans la saga (« Protagoniste », « Antagoniste », « Soutien »). */ role: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("role"),
    affiliation: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("affiliation"),
    /** Ce que devient le personnage pendant la saga (markdown). */ summary: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("summary"),
    /** Faits marquants, un par puce. */ highlights: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("highlights").$type(),
    /** Transformations disponibles à cette période (ids `db_transformations`). */ transformationIds: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("transformation_ids").$type(),
    /** Techniques employées à cette période (ids `db_techniques`). */ techniqueIds: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("technique_ids").$type(),
    /** Premier et dernier tome du manga où le personnage est repéré. */ firstVolume: int("first_volume"),
    lastVolume: int("last_volume"),
    /** Premier et dernier épisode dont le synopsis nomme le personnage. */ firstEpisode: int("first_episode"),
    lastEpisode: int("last_episode"),
    /**
   * Épisodes dont le TITRE nomme le personnage — le seul contenu éditorial de
   * la variante qui se mesure. Les transformations et les techniques, elles,
   * ne se mesurent pas : leurs libellés en base viennent des jeux vidéo
   * (« Goku SSJ2 », « Pose de combat G ») et la VF du manga traduit tout —
   * « kamehameha » n'apparaît que sur UNE planche des 7 830 de l'OCR.
   */ keyEpisodes: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("key_episodes").$type(),
    /** Méthode de mesure, ou "editorial" quand la variante est écrite à la main. */ origin: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("origin"),
    evidence: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("evidence").$type(),
    sortOrder: int("sort_order").notNull().default(0),
    visible: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("visible").notNull().default(true)
});
const botEpisodes = bot.table("db_episodes", {
    id: int("id").primaryKey(),
    series: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("series").notNull(),
    numberInSeries: int("number_in_series"),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title"),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    titleRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_romaji"),
    arcId: int("arc_id"),
    airDate: int("air_date"),
    durationSec: int("duration_sec"),
    synopsis: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("synopsis"),
    // Traduction FR générée (script translate-synopsis-fr.ts). Null = pas encore traduit.
    synopsisFr: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("synopsis_fr"),
    /** Page primaire Toei ayant servi aux métadonnées japonaises. */ officialSourceUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("official_source_url"),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    malId: int("mal_id"),
    videoUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("video_url"),
    // Pistes de sous-titres : [{ lang, label, src }] où `src` est un chemin
    // d'asset bot (assets/subtitles/...) en .vtt ou .srt, ou une URL .vtt.
    // Colonne Neon-only (le reverse-sync l'ignore par intersection de colonnes ;
    // seul le lecteur du site la lit).
    subtitles: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("subtitles").$type(),
    // Lecteurs externes (voir-anime) : [{ name, provider, embedUrl }] affichés en
    // iframe. Colonne Neon-only, rafraîchie par import-voiranime-players.ts.
    players: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("players").$type(),
    /** Offres légales relevées (cf. type `Availability`). */ availability: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("availability").$type(),
    // Flux résolu (HLS/mp4) + headers requis (Referer), pour le proxy HLS du
    // site qui le relaie à notre player hls.js. Rafraîchi par resolve-streams.ts
    // (tokens ~12 h). Colonnes Neon-only.
    streamUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("stream_url"),
    streamHeaders: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("stream_headers").$type(),
    streamProvider: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("stream_provider"),
    streamAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$bigint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["bigint"])("stream_at", {
        mode: "number"
    }),
    streams: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("streams").$type(),
    // Scènes d'épisode : frames extraites (jsonb) + montage MP4 preview animé.
    // Colonnes posées sur Neon ; alimentées par le pipeline bot (extraction +
    // montage). Le reverse-sync Neon→SQLite les ignore (intersection de colonnes).
    frames: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("frames").$type(),
    scenePreview: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("scene_preview"),
    ...visibleCol
});
const botMovies = bot.table("db_movies", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    titleRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_romaji"),
    series: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("series"),
    releaseDate: int("release_date"),
    durationMin: int("duration_min"),
    synopsis: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("synopsis"),
    // Traduction FR générée (script translate-synopsis-fr.ts). Null = pas encore traduit.
    synopsisFr: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("synopsis_fr"),
    poster: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("poster"),
    malId: int("mal_id"),
    anilistId: int("anilist_id"),
    trailerUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("trailer_url"),
    videoUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("video_url"),
    subtitles: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("subtitles").$type(),
    players: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("players").$type(),
    /** Offres légales relevées (cf. type `Availability`). */ availability: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("availability").$type(),
    streamUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("stream_url"),
    streamHeaders: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("stream_headers").$type(),
    streamProvider: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("stream_provider"),
    streamAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$bigint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["bigint"])("stream_at", {
        mode: "number"
    }),
    streams: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("streams").$type(),
    ...visibleCol
});
const botGames = bot.table("db_games", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    platforms: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("platforms"),
    releaseDate: int("release_date"),
    publisher: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("publisher"),
    developer: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("developer"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    cover: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("cover"),
    officialUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("official_url"),
    /** Galerie style Steam (screenshots + trailers). */ media: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("media").$type(),
    ...visibleCol
});
const botGameCharacters = bot.table("db_game_characters", {
    gameId: int("game_id").notNull(),
    characterId: int("character_id").notNull()
});
const botMangaVolumes = bot.table("db_manga_volumes", {
    id: int("id").primaryKey(),
    series: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("series").notNull(),
    volumeNumber: int("volume_number"),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title"),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    publishedAt: int("published_at"),
    cover: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("cover"),
    isbn: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("isbn"),
    ...visibleCol
});
const botDatabooks = bot.table("db_databooks", {
    id: int("id").primaryKey(),
    /**
   * Type technique dérivé de `category` à l'écriture :
   * "databook" | "interview" | "artbook" | "guidebook".
   * L'UI n'édite plus ce champ — source de vérité = `category`.
   */ kind: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("kind").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    author: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("author"),
    isbn: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("isbn"),
    /** Date de publication (epoch ms) — sert au tri. */ publishedAt: int("published_at"),
    cover: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("cover"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    sourceUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_url"),
    /**
   * Catégorie unifiée (Databook, Interview, Art Book, Saikyō Jump,
   * V-Jump, Weekly Shonen Jump, Light Novel, Jump Anime Comics,
   * Pamphlet & Fair, Autre). Voir `DATABOOK_CATEGORIES`.
   */ category: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("category"),
    /** Slots lecteur : numéro + image + texte sous l'image. */ pages: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("pages").$type(),
    ...visibleCol
});
const botMediaPublications = bot.table("db_media_publications", {
    id: int("id").primaryKey(),
    legacyDatabookId: int("legacy_databook_id").notNull().unique(),
    publicationType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("publication_type").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    author: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("author"),
    illustrator: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("illustrator"),
    publishedAt: int("published_at"),
    cover: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("cover"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    pages: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("pages").$type(),
    ...visibleCol
});
const botMediaWorks = bot.table("media_works", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    kind: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("kind").notNull(),
    series: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("series").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    titleRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_romaji"),
    synopsisFr: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("synopsis_fr"),
    sourceId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_id"),
    ...visibleCol,
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("created_at", {
        withTimezone: true
    }).defaultNow(),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updated_at", {
        withTimezone: true
    }).defaultNow()
});
const botMediaEditions = bot.table("media_editions", {
    id: int("id").primaryKey(),
    workId: int("work_id").notNull(),
    edition: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("edition").notNull(),
    label: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("label").notNull(),
    language: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("language").notNull().default("ja"),
    isbn: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("isbn"),
    publisher: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("publisher"),
    publishedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("published_at"),
    pageColor: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("page_color").notNull().default("nb"),
    scanPolicy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("scan_policy").notNull().default("self_hosted"),
    ...visibleCol
});
const botMediaEditionAliases = bot.table("media_edition_aliases", {
    aliasId: int("alias_id").primaryKey().references(()=>botMediaEditions.id),
    canonicalId: int("canonical_id").notNull().references(()=>botMediaEditions.id),
    reason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("reason").notNull(),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("created_at", {
        withTimezone: true
    }).notNull().defaultNow(),
    createdBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("created_by").notNull()
});
const botMediaVolumes = bot.table("media_volumes", {
    id: int("id").primaryKey(),
    editionId: int("edition_id").notNull(),
    legacyVolumeId: int("legacy_volume_id").unique(),
    number: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$numeric$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["numeric"])("number").notNull(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title"),
    cover: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("cover"),
    pageCount: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("page_count"),
    ...visibleCol
});
const botMediaChapters = bot.table("media_chapters", {
    id: int("id").primaryKey(),
    volumeId: int("volume_id").notNull(),
    legacyChapterId: int("legacy_chapter_id").unique(),
    number: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$numeric$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["numeric"])("number").notNull(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title"),
    pages: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("pages").$type().default([]),
    ocrStatus: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("ocr_status").notNull().default("unprocessed"),
    ...visibleCol
});
const botMediaPageAssets = bot.table("media_page_assets", {
    id: int("id").primaryKey(),
    uri: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("uri").notNull(),
    width: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("width"),
    height: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("height"),
    sha256: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("sha256").notNull().unique(),
    sourceId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_id")
});
const botMediaPageRefs = bot.table("media_page_refs", {
    chapterId: int("chapter_id").notNull(),
    assetId: int("asset_id").notNull(),
    ordinal: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("ordinal").notNull(),
    pageLabel: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("page_label")
});
const botNarrativeTimelines = bot.table("narrative_timelines", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    kind: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("kind").notNull(),
    label: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("label").notNull(),
    parentId: int("parent_id"),
    sourceId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_id"),
    ...visibleCol
});
const botNarrativeEvents = bot.table("narrative_events", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    kind: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("kind").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    titleRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_romaji"),
    synopsisFr: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("synopsis_fr"),
    timelineId: int("timeline_id").notNull(),
    sagaId: int("saga_id"),
    arcId: int("arc_id"),
    canon: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("canon").notNull().default("unverified"),
    startOrder: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$numeric$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["numeric"])("start_order"),
    endOrder: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$numeric$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["numeric"])("end_order"),
    sourceId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_id"),
    ...visibleCol
});
const botNarrativeEventAliases = bot.table("narrative_event_aliases", {
    eventId: int("event_id").notNull(),
    alias: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("alias").notNull(),
    locale: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("locale").notNull().default("fr")
});
const botNarrativeEventParticipants = bot.table("narrative_event_participants", {
    eventId: int("event_id").notNull(),
    characterId: int("character_id").notNull(),
    role: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("role").notNull().default("participant"),
    outcome: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("outcome")
});
const botNarrativeEventRelations = bot.table("narrative_event_relations", {
    fromEventId: int("from_event_id").notNull(),
    toEventId: int("to_event_id").notNull(),
    relation: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("relation").notNull()
});
const botContributors = bot.table("contributors", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    nameRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_romaji"),
    category: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("category").notNull(),
    birthDate: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("birth_date"),
    deathDate: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("death_date"),
    biographyFr: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("biography_fr"),
    spotlightRank: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("spotlight_rank"),
    sourceId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_id"),
    ...visibleCol
});
const botContributorCredits = bot.table("contributor_credits", {
    id: int("id").primaryKey(),
    contributorId: int("contributor_id").notNull(),
    role: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("role").notNull(),
    creditScope: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("credit_scope").notNull(),
    workId: int("work_id"),
    episodeId: int("episode_id"),
    movieId: int("movie_id"),
    gameId: int("game_id"),
    soundtrackId: int("soundtrack_id"),
    characterId: int("character_id"),
    sourceId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_id"),
    ...visibleCol
});
const botMangaChapters = bot.table("db_manga_chapters", {
    id: int("id").primaryKey(),
    series: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("series").notNull(),
    chapterNumber: int("chapter_number"),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title"),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    volumeId: int("volume_id"),
    publishedAt: int("published_at"),
    cover: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("cover"),
    // Pages du chapitre = liste ordonnée de chemins d'images (assetUrl côté site).
    // Colonne Neon-only : le reverse-sync Neon→SQLite l'ignore (intersection de
    // colonnes), le bot n'en a pas besoin (seul le reader du site lit les pages).
    pages: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("pages").$type(),
    ...visibleCol
});
const botMangaPages = bot.table("db_manga_pages", {
    id: int("id").primaryKey(),
    series: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("series"),
    tome: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("tome"),
    planche: int("planche"),
    /** Bulles OCR (json array de strings) — stocké text/jsonb selon sync. */ lines: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("lines"),
    text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("text"),
    lang: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("lang"),
    hasJa: int("has_ja"),
    lineCount: int("line_count"),
    charCount: int("char_count")
});
const botNews = bot.table("db_news", {
    id: int("id").primaryKey(),
    sourceId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_id"),
    sourceUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_url"),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    excerpt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("excerpt"),
    category: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("category"),
    publishedAt: int("published_at"),
    fetchedAt: int("fetched_at"),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image")
});
const botTools = bot.table("db_tools", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    url: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("url"),
    author: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("author"),
    language: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("language"),
    category: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("category"),
    targetGameId: int("target_game_id"),
    stars: int("stars"),
    /** Dépôt archivé en amont sur GitHub. */ archived: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("archived").notNull().default(false),
    /** Dernier push amont (epoch ms) — repère de dépôt mort. */ pushedAt: int("pushed_at"),
    /** Dernier rafraîchissement GitHub (epoch ms). */ checkedAt: int("checked_at"),
    ...visibleCol
});
const botSources = bot.table("db_sources", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    url: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("url"),
    licenseKey: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("license_key"),
    attributionTemplate: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("attribution_template")
});
const botLicenses = bot.table("db_licenses", {
    key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("key").primaryKey(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    url: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("url"),
    requiresAttribution: int("requires_attribution"),
    shareAlike: int("share_alike")
});
const botAssets = bot.table("db_assets", {
    id: int("id").primaryKey(),
    path: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("path").notNull(),
    sourceId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_id"),
    sourceUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_url"),
    licenseKey: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("license_key"),
    attribution: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("attribution"),
    sha256: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("sha256"),
    mimeType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("mime_type"),
    bytes: int("bytes"),
    width: int("width"),
    height: int("height"),
    entityType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("entity_type"),
    entityId: int("entity_id"),
    role: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("role"),
    createdAt: int("created_at")
});
const botWikiSections = bot.table("db_wiki_sections", {
    id: int("id").primaryKey(),
    /** Type d'entité parente ("character", "planet", "saga", "race", "technique", "arc", "game", "movie"). */ entityType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("entity_type").notNull(),
    entityId: int("entity_id").notNull(),
    /** Slug de section ("histoire", "personnalite", "anecdotes", "pws"…) — libre. */ key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("key").notNull(),
    /** Libellé affiché (pilule + titre du bloc). */ label: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("label").notNull(),
    /** Couleur d'accent du bandeau (orange|blue|red|green|purple|gold|cyan|pink), défaut orange. */ accent: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("accent"),
    /** Corps markdown riche (rendu via WikiMarkdown). */ body: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("body"),
    /** Sous-catégorie : nom d'un GROUPE parent qui regroupe plusieurs sections
   *  (ex. « Powerscaling »). NULL = section de 1er niveau. */ groupLabel: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("group_label"),
    /** Pages wiki affiliées : cartes avec photo (liens internes). */ links: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("links").$type(),
    sortOrder: int("sort_order").notNull().default(0),
    visible: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("visible").notNull().default(true)
});
const botDragonballcnVolumes = bot.table("dragonballcn_volumes", {
    did: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("did").primaryKey(),
    category: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("category").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    categoryTitle: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("category_title"),
    arc: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("arc"),
    coverUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("cover_url"),
    url: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("url"),
    date: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("date"),
    totalPages: int("total_pages").notNull().default(0),
    pages: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("pages").$type().notNull(),
    scrapedAt: int("scraped_at"),
    updatedAt: int("updated_at")
});
const botBattles = bot.table("db_battles", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    sagaId: int("saga_id"),
    arcId: int("arc_id"),
    series: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("series").notNull(),
    combatants: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("combatants").$type().notNull(),
    winnerId: int("winner_id"),
    winnerName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("winner_name"),
    location: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("location"),
    mangaVolumeStart: int("manga_volume_start"),
    mangaVolumeEnd: int("manga_volume_end"),
    mangaChapterStart: int("manga_chapter_start"),
    mangaChapterEnd: int("manga_chapter_end"),
    episodeStart: int("episode_start"),
    episodeEnd: int("episode_end"),
    techniquesUsed: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("techniques_used").$type(),
    climaxSummary: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("climax_summary"),
    canon: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("canon").notNull().default(true),
    impactLevel: int("impact_level").default(3),
    ...articleCols,
    ...visibleCol
});
const botTimelineEvents = bot.table("db_timeline_events", {
    id: int("id").primaryKey(),
    ageYear: int("age_year").notNull(),
    ageMonth: int("age_month"),
    ageDay: int("age_day"),
    era: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("era").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description").notNull(),
    charactersInvolved: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("characters_involved").$type(),
    sourceRef: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_ref"),
    canon: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("canon").notNull().default(true),
    orderIdx: int("order_idx").notNull().default(0),
    ...visibleCol
});
const botPowerLevels = bot.table("db_power_levels", {
    id: int("id").primaryKey(),
    characterId: int("character_id"),
    characterName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("character_name").notNull(),
    form: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("form"),
    sagaId: int("saga_id"),
    sagaName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("saga_name"),
    battlePower: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$bigint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["bigint"])("battle_power", {
        mode: "number"
    }),
    battlePowerDisplay: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("battle_power_display").notNull(),
    scouterDevice: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("scouter_device"),
    sourceKind: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_kind").notNull(),
    sourcePage: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_page"),
    canon: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("canon").notNull().default(true),
    notes: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("notes"),
    ...visibleCol
});
const botItems = bot.table("db_items", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    nameRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_romaji"),
    category: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("category").notNull(),
    creator: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("creator"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description").notNull(),
    debutChapter: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("debut_chapter"),
    debutEpisode: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("debut_episode"),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    ...articleCols,
    ...visibleCol
});
const botDragons = bot.table("db_dragons", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    creator: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("creator"),
    planetRealm: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("planet_realm"),
    ballsCount: int("balls_count").notNull().default(7),
    ballsDiameter: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("balls_diameter"),
    summonPhrase: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("summon_phrase"),
    summonPhraseJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("summon_phrase_ja"),
    wishesCount: int("wishes_count").notNull().default(1),
    cooldown: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("cooldown"),
    rules: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("rules"),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    ...articleCols,
    ...visibleCol
});
const botWishes = bot.table("db_wishes", {
    id: int("id").primaryKey(),
    dragonId: int("dragon_id").notNull(),
    dragonName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("dragon_name").notNull(),
    wishNumberInSummon: int("wish_number_in_summon").default(1),
    whisperer: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("whisperer").notNull(),
    saga: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("saga").notNull(),
    mangaChapter: int("manga_chapter"),
    episodeNumber: int("episode_number"),
    wishText: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("wish_text").notNull(),
    granted: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("granted").notNull().default(true),
    canon: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("canon").notNull().default(true),
    ...visibleCol
});
const botLocations = bot.table("db_locations", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    nameRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_romaji"),
    realmType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("realm_type").notNull(),
    planet: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("planet"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description").notNull(),
    debutChapter: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("debut_chapter"),
    debutEpisode: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("debut_episode"),
    keyEvents: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("key_events").$type(),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    ...articleCols,
    ...visibleCol
});
const botTournaments = bot.table("db_tournaments", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    tournamentType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("tournament_type").notNull(),
    saga: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("saga").notNull(),
    location: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("location"),
    winnerName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("winner_name"),
    runnerUpName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("runner_up_name"),
    rulesSummary: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("rules_summary").notNull(),
    participantsCount: int("participants_count"),
    notableMatches: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("notable_matches").$type(),
    canon: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("canon").notNull().default(true),
    ...articleCols,
    ...visibleCol
});
const botVoiceActors = bot.table("db_voice_actors", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    nameJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name_ja"),
    nationality: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("nationality").notNull(),
    birthDate: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("birth_date"),
    roles: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("roles").$type().notNull(),
    biography: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("biography").notNull(),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    ...articleCols,
    ...visibleCol
});
const botSoundtracks = bot.table("db_soundtracks", {
    id: int("id").primaryKey(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    titleJa: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_ja"),
    titleRomaji: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title_romaji"),
    trackType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("track_type").notNull(),
    series: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("series").notNull(),
    artist: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("artist").notNull(),
    composer: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("composer"),
    lyricist: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("lyricist"),
    episodesRange: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("episodes_range"),
    releaseYear: int("release_year"),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description").notNull(),
    ...articleCols,
    ...visibleCol
});
}),
"[project]/packages/db/src/config.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Default pool size, aligned with rg `packages/db/src/pg.ts`. */ __turbopack_context__.s([
    "DEFAULT_POOL_MAX",
    ()=>DEFAULT_POOL_MAX,
    "POOL_MAX_CEILING",
    ()=>POOL_MAX_CEILING,
    "isDatabaseConfigured",
    ()=>isDatabaseConfigured,
    "resolveDatabaseUrl",
    ()=>resolveDatabaseUrl,
    "resolvePoolMax",
    ()=>resolvePoolMax
]);
const DEFAULT_POOL_MAX = 4;
const POOL_MAX_CEILING = 20;
function resolveDatabaseUrl(raw) {
    const url = raw?.trim();
    if (!url || url === "undefined" || url === "null" || url.startsWith("eyJ2Ijo")) {
        throw new Error("DATABASE_URL is missing or corrupted: a postgres:// connection string is required.");
    }
    let parsed;
    try {
        parsed = new URL(url);
    } catch  {
        throw new Error("DATABASE_URL is not a valid URL: a postgres:// connection string is required.");
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error(`DATABASE_URL must use the postgres:// or postgresql:// scheme (got "${parsed.protocol}").`);
    }
    return url;
}
function resolvePoolMax(raw) {
    const value = Number.parseInt(raw?.trim() ?? "", 10);
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_POOL_MAX;
    return Math.min(value, POOL_MAX_CEILING);
}
function isDatabaseConfigured(env = process.env) {
    try {
        resolveDatabaseUrl(env.DATABASE_URL);
        return true;
    } catch  {
        return false;
    }
}
}),
"[project]/packages/db/src/constants.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/**
 * Zero-dependency constants shared by the site, the bot, the API and the MCP
 * contract. Runtime class: `pure` — this module imports nothing.
 */ /**
 * Agent key scopes (write API of the site). Re-exported by `./schema` so the
 * historical `AGENT_SCOPES` import path keeps working.
 */ __turbopack_context__.s([
    "AGENT_SCOPES",
    ()=>AGENT_SCOPES,
    "FEEDBACK_STATUSES",
    ()=>FEEDBACK_STATUSES,
    "GOAL_PRIORITIES",
    ()=>GOAL_PRIORITIES,
    "WIKI_CATEGORIES",
    ()=>WIKI_CATEGORIES,
    "isWikiCategoryName",
    ()=>isWikiCategoryName
]);
const AGENT_SCOPES = [
    /** Lecture du catalogue, du fil et des commentaires. */ "read",
    /** Déposer une proposition de correction wiki (file de modération). */ "contribute",
    /** Créer/modifier des articles — toujours en brouillon. */ "write:articles",
    /** Publier un article (mise en ligne immédiate ou programmée). */ "publish:articles",
    /** Écrire un commentaire signé du nom de l'agent. */ "comment",
    /** Accepter/refuser des contributions, masquer des commentaires. */ "moderate"
];
const FEEDBACK_STATUSES = [
    "pending",
    "gold_added",
    "rejected",
    "reviewed"
];
const GOAL_PRIORITIES = [
    "p0",
    "p1",
    "p2",
    "p3"
];
const WIKI_CATEGORIES = [
    {
        name: "characters",
        label: "Personnages"
    },
    {
        name: "planets",
        label: "Planètes"
    },
    {
        name: "races",
        label: "Races"
    },
    {
        name: "techniques",
        label: "Techniques"
    },
    {
        name: "transformations",
        label: "Transformations"
    },
    {
        name: "sagas",
        label: "Sagas"
    },
    {
        name: "arcs",
        label: "Arcs"
    },
    {
        name: "episodes",
        label: "Épisodes"
    },
    {
        name: "movies",
        label: "Films"
    },
    {
        name: "games",
        label: "Jeux"
    },
    {
        name: "tools",
        label: "Outils"
    },
    {
        name: "battles",
        label: "Combats"
    },
    {
        name: "items",
        label: "Objets"
    },
    {
        name: "dragons",
        label: "Dragons"
    },
    {
        name: "wishes",
        label: "Vœux"
    },
    {
        name: "locations",
        label: "Lieux"
    },
    {
        name: "tournaments",
        label: "Tournois"
    },
    {
        name: "voice_actors",
        label: "Comédiens de doublage"
    },
    {
        name: "soundtracks",
        label: "Bandes originales"
    },
    {
        name: "power_levels",
        label: "Niveaux de puissance"
    },
    {
        name: "timeline_events",
        label: "Événements chronologiques"
    }
];
function isWikiCategoryName(value) {
    return typeof value === "string" && WIKI_CATEGORIES.some((c)=>c.name === value);
}
}),
"[project]/packages/db/src/full-schema.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "fullSchema",
    ()=>fullSchema
]);
// SPDX-License-Identifier: Apache-2.0
/** Public + `bot` schemas merged for a single Drizzle client. Runtime class: `pure`. */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$bot$2d$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/bot-schema.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/schema.ts [middleware] (ecmascript)");
;
;
const fullSchema = {
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__,
    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$bot$2d$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__
};
}),
"[project]/packages/db/src/postgres-js.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createDb",
    ()=>createDb
]);
// SPDX-License-Identifier: Apache-2.0
/** postgres-js pool + Drizzle. Runtime class: `server`. */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$postgres$2d$js$2f$driver$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/postgres-js/driver.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$postgres$40$3$2e$4$2e$9$2f$node_modules$2f$postgres$2f$src$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/postgres@3.4.9/node_modules/postgres/src/index.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$full$2d$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/full-schema.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/schema.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$sql$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/sql.ts [middleware] (ecmascript)");
;
;
;
;
;
function createDb(options) {
    const resolved = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$sql$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolvePgClientOptions"])(options);
    const client = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$postgres$40$3$2e$4$2e$9$2f$node_modules$2f$postgres$2f$src$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["default"])(resolved.url, (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$sql$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["postgresJsOptions"])(resolved));
    if (options.schema === "full") {
        return {
            db: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$postgres$2d$js$2f$driver$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["drizzle"])(client, {
                schema: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$full$2d$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["fullSchema"],
                logger: false
            }),
            client
        };
    }
    return {
        db: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$postgres$2d$js$2f$driver$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["drizzle"])(client, {
            schema: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__,
            logger: false
        }),
        client
    };
}
}),
"[project]/packages/db/src/repos/accounts.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DISCORD_PROVIDER_ID",
    ()=>DISCORD_PROVIDER_ID,
    "createDiscordAccountLookup",
    ()=>createDiscordAccountLookup,
    "discordAccountQuery",
    ()=>discordAccountQuery
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Discord account lookup over Better Auth's `ba_account` (provider `discord`).
 * Structurally satisfies `DiscordAccountLookup` of `@aphrody/shenron-auth`.
 * Runtime class: `pure`.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/sql/expressions/conditions.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/src/schema.ts [middleware] (ecmascript) <locals>");
;
;
;
;
const DISCORD_PROVIDER_ID = "discord";
function discordAccountQuery(db, baUserId) {
    return db.select({
        accountId: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["baAccount"].accountId
    }).from(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["baAccount"]).where((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["and"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["eq"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["baAccount"].userId, baUserId), (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["eq"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["baAccount"].providerId, DISCORD_PROVIDER_ID))).limit(1);
}
function createDiscordAccountLookup(db) {
    return {
        async discordIdForUser (baUserId) {
            const [row] = await discordAccountQuery(db, baUserId);
            return row?.accountId || null;
        }
    };
}
}),
"[project]/packages/db/src/repos/agent-keys.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AGENT_TOKEN_PREFIX",
    ()=>AGENT_TOKEN_PREFIX,
    "DEFAULT_AGENT_RATE_LIMIT",
    ()=>DEFAULT_AGENT_RATE_LIMIT,
    "agentKeyQueries",
    ()=>agentKeyQueries,
    "base64url",
    ()=>base64url,
    "createAgentKeyRepository",
    ()=>createAgentKeyRepository,
    "generateAgentToken",
    ()=>generateAgentToken,
    "hashAgentToken",
    ()=>hashAgentToken,
    "isAgentScope",
    ()=>isAgentScope,
    "parseScopes",
    ()=>parseScopes
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Agent key repository (`AgentKey`, `AgentAudit`). Structurally satisfies the
 * `AgentKeyStore` port of `@aphrody/shenron-auth` and carries the admin operations of
 * `apps/site/src/lib/agent-keys.ts` with the same surface. Only the SHA-256 of
 * a token is stored; revocation is soft (`revokedAt`), rows are never deleted.
 *
 * Runtime class: `pure` (Web Crypto only, query builder only).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/sql/expressions/conditions.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$select$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/sql/expressions/select.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/sql/sql.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/constants.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/src/schema.ts [middleware] (ecmascript) <locals>");
;
;
;
const AGENT_TOKEN_PREFIX = "dbfr_agent_";
const DEFAULT_AGENT_RATE_LIMIT = 120;
function isAgentScope(value) {
    return typeof value === "string" && __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AGENT_SCOPES"].includes(value);
}
function parseScopes(input) {
    if (!Array.isArray(input)) return [];
    return [
        ...new Set(input.filter(isAgentScope))
    ];
}
function toHex(bytes) {
    let out = "";
    for (const b of bytes)out += b.toString(16).padStart(2, "0");
    return out;
}
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function base64url(bytes) {
    let out = "";
    let i = 0;
    for(; i + 2 < bytes.length; i += 3){
        const n = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
        out += B64URL[n >> 18 & 63] + B64URL[n >> 12 & 63] + B64URL[n >> 6 & 63] + B64URL[n & 63];
    }
    const rest = bytes.length - i;
    if (rest === 1) {
        const n = bytes[i] << 16;
        out += B64URL[n >> 18 & 63] + B64URL[n >> 12 & 63];
    } else if (rest === 2) {
        const n = bytes[i] << 16 | bytes[i + 1] << 8;
        out += B64URL[n >> 18 & 63] + B64URL[n >> 12 & 63] + B64URL[n >> 6 & 63];
    }
    return out;
}
async function hashAgentToken(token) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return toHex(new Uint8Array(digest));
}
function generateAgentToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `${AGENT_TOKEN_PREFIX}${base64url(bytes)}`;
}
function agentKeyQueries(db) {
    return {
        findByHash: (hash)=>db.select().from(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"]).where((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["eq"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"].tokenHash, hash)).limit(1),
        touch: (id, at)=>db.update(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"]).set({
                lastUsedAt: at
            }).where((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["eq"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"].id, id)),
        countWritesSince: (id, since)=>db.select({
                total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`count(*)::int`
            }).from(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"]).where((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["and"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["eq"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"].keyId, id), (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["gt"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"].createdAt, since))),
        callsLastHour: (id)=>db.select({
                total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`count(*)::int`
            }).from(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"]).where((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["and"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["eq"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"].keyId, id), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`${__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"].createdAt} > now() - interval '1 hour'`)),
        recordCall: (entry)=>db.insert(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"]).values({
                keyId: entry.keyId,
                keyName: entry.keyName,
                method: entry.method.slice(0, 10),
                path: entry.path.slice(0, 300),
                status: entry.status,
                summary: entry.summary?.slice(0, 500) ?? null
            }),
        insertKey: (values)=>db.insert(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"]).values(values).returning(),
        listKeys: ()=>db.select().from(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"]).orderBy((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$select$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["desc"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"].createdAt)),
        calls24hByKey: ()=>db.select({
                keyId: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"].keyId,
                total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`count(*)::int`
            }).from(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"]).where(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`${__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"].createdAt} > now() - interval '24 hours'`).groupBy(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"].keyId),
        revoke: (id, at)=>db.update(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"]).set({
                revokedAt: at
            }).where((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["and"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["eq"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"].id, id), (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["isNull"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"].revokedAt))).returning({
                id: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"].id
            }),
        updateScopes: (id, scopes)=>db.update(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"]).set({
                scopes
            }).where((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$conditions$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["eq"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"].id, id)).returning({
                id: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"].id
            }),
        listAudit: (limit)=>db.select().from(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"]).orderBy((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$expressions$2f$select$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["desc"])(__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"].createdAt)).limit(Math.min(500, Math.max(1, limit)))
    };
}
function createAgentKeyRepository(db) {
    const q = agentKeyQueries(db);
    return {
        /** Key whose hash matches, revoked or not (the guard checks `revokedAt`). */ async findActiveByHash (hash) {
            const [row] = await q.findByHash(hash);
            if (!row) return null;
            return {
                id: row.id,
                name: row.name,
                scopes: row.scopes ?? [],
                revokedAt: row.revokedAt ?? null,
                rateLimit: row.rateLimitPerHour ?? DEFAULT_AGENT_RATE_LIMIT
            };
        },
        async touch (id, at) {
            await q.touch(id, at);
        },
        async countWritesSince (id, since) {
            const rows = await q.countWritesSince(id, since);
            return Number(rows[0]?.total ?? 0);
        },
        /** Never throws: the audit must not break the API. */ async recordCall (entry) {
            try {
                await q.recordCall(entry);
            } catch (err) {
                console.error("[agent-keys] audit", err);
            }
        },
        // ── Admin operations (surface of apps/site/src/lib/agent-keys.ts) ──
        /** Creates a key. The returned token is the only plain copy that will ever exist. */ async createAgentKey (input) {
            const name = input.name.trim().slice(0, 80);
            if (!name) throw new Error("name_required");
            const scopes = parseScopes(input.scopes);
            if (scopes.length === 0) throw new Error("scopes_required");
            const token = generateAgentToken();
            const [row] = await q.insertKey({
                name,
                prefix: token.slice(0, AGENT_TOKEN_PREFIX.length + 6),
                tokenHash: await hashAgentToken(token),
                scopes,
                note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
                createdBy: input.createdBy ?? null,
                rateLimitPerHour: input.rateLimitPerHour ?? null
            });
            if (!row) throw new Error("insert_failed");
            return {
                id: row.id,
                name: row.name,
                prefix: row.prefix,
                scopes,
                token
            };
        },
        async listAgentKeys () {
            const rows = await q.listKeys();
            if (rows.length === 0) return [];
            const counts = await q.calls24hByKey();
            const byKey = new Map(counts.map((c)=>[
                    c.keyId ?? "",
                    Number(c.total)
                ]));
            return rows.map((r)=>({
                    id: r.id,
                    name: r.name,
                    prefix: r.prefix,
                    scopes: r.scopes ?? [],
                    note: r.note,
                    createdBy: r.createdBy,
                    createdAt: r.createdAt.toISOString(),
                    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
                    revokedAt: r.revokedAt?.toISOString() ?? null,
                    rateLimitPerHour: r.rateLimitPerHour,
                    calls24h: byKey.get(r.id) ?? 0
                }));
        },
        /** Soft revocation: the row stays so the audit remains readable. */ async revokeAgentKey (id) {
            const res = await q.revoke(id, new Date());
            return res.length > 0;
        },
        async updateAgentKeyScopes (id, scopes) {
            const next = parseScopes(scopes);
            if (next.length === 0) return false;
            const res = await q.updateScopes(id, next);
            return res.length > 0;
        },
        /** Calls of this key over the last hour (quota). */ async agentCallsLastHour (keyId) {
            const rows = await q.callsLastHour(keyId);
            return Number(rows[0]?.total ?? 0);
        },
        async recordAgentCall (entry) {
            try {
                await q.recordCall(entry);
            } catch (err) {
                console.error("[agent-keys] audit", err);
            }
        },
        async listAgentAudit (limit = 100) {
            const rows = await q.listAudit(limit);
            return rows.map((r)=>({
                    id: r.id,
                    keyName: r.keyName,
                    method: r.method,
                    path: r.path,
                    status: r.status,
                    summary: r.summary,
                    createdAt: r.createdAt.toISOString()
                }));
        }
    };
}
}),
"[project]/packages/db/src/schema.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AGENT_SCOPES",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["AGENT_SCOPES"],
    "COMMENT_STATUSES",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["COMMENT_STATUSES"],
    "CONTRIBUTION_STATUSES",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["CONTRIBUTION_STATUSES"],
    "POST_STATUSES",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["POST_STATUSES"],
    "RATING_TARGET_TYPES",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["RATING_TARGET_TYPES"],
    "REACTION_KINDS",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["REACTION_KINDS"],
    "SOCIAL_TARGET_KINDS",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["SOCIAL_TARGET_KINDS"],
    "agentAudit",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentAudit"],
    "agentKeys",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["agentKeys"],
    "baAccount",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["baAccount"],
    "baSession",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["baSession"],
    "baUser",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["baUser"],
    "baVerification",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["baVerification"],
    "canonConfig",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["canonConfig"],
    "canonIngestRuns",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["canonIngestRuns"],
    "canonReferences",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["canonReferences"],
    "canonVerdicts",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["canonVerdicts"],
    "chronologyConfig",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["chronologyConfig"],
    "comments",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["comments"],
    "commentsRelations",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["commentsRelations"],
    "contentComments",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["contentComments"],
    "contentCommentsRelations",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["contentCommentsRelations"],
    "contentReactions",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["contentReactions"],
    "contributionRights",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["contributionRights"],
    "editorDrafts",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["editorDrafts"],
    "homeConfig",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["homeConfig"],
    "pageBanners",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["pageBanners"],
    "posts",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["posts"],
    "postsRelations",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["postsRelations"],
    "siteEvents",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["siteEvents"],
    "siteRatings",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["siteRatings"],
    "siteRatingsRelations",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["siteRatingsRelations"],
    "siteReports",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["siteReports"],
    "siteTheme",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["siteTheme"],
    "tierlistVotes",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["tierlistVotes"],
    "tierlists",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["tierlists"],
    "tierlistsRelations",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["tierlistsRelations"],
    "urlRedirects",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["urlRedirects"],
    "userPreferences",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["userPreferences"],
    "users",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["users"],
    "usersRelations",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["usersRelations"],
    "wikiCategories",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["wikiCategories"],
    "wikiCategoriesRelations",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["wikiCategoriesRelations"],
    "wikiContributions",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["wikiContributions"],
    "wikiLaunch",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["wikiLaunch"],
    "wikiPages",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["wikiPages"],
    "wikiPagesRelations",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["wikiPagesRelations"],
    "wikiRevisions",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["wikiRevisions"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$schema$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/packages/db/src/schema.ts [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$constants$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/constants.ts [middleware] (ecmascript)");
}),
"[project]/packages/db/src/schema.ts [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "COMMENT_STATUSES",
    ()=>COMMENT_STATUSES,
    "CONTRIBUTION_STATUSES",
    ()=>CONTRIBUTION_STATUSES,
    "POST_STATUSES",
    ()=>POST_STATUSES,
    "RATING_TARGET_TYPES",
    ()=>RATING_TARGET_TYPES,
    "REACTION_KINDS",
    ()=>REACTION_KINDS,
    "SOCIAL_TARGET_KINDS",
    ()=>SOCIAL_TARGET_KINDS,
    "agentAudit",
    ()=>agentAudit,
    "agentKeys",
    ()=>agentKeys,
    "baAccount",
    ()=>baAccount,
    "baSession",
    ()=>baSession,
    "baUser",
    ()=>baUser,
    "baVerification",
    ()=>baVerification,
    "canonConfig",
    ()=>canonConfig,
    "canonIngestRuns",
    ()=>canonIngestRuns,
    "canonReferences",
    ()=>canonReferences,
    "canonVerdicts",
    ()=>canonVerdicts,
    "chronologyConfig",
    ()=>chronologyConfig,
    "comments",
    ()=>comments,
    "commentsRelations",
    ()=>commentsRelations,
    "contentComments",
    ()=>contentComments,
    "contentCommentsRelations",
    ()=>contentCommentsRelations,
    "contentReactions",
    ()=>contentReactions,
    "contributionRights",
    ()=>contributionRights,
    "editorDrafts",
    ()=>editorDrafts,
    "homeConfig",
    ()=>homeConfig,
    "pageBanners",
    ()=>pageBanners,
    "posts",
    ()=>posts,
    "postsRelations",
    ()=>postsRelations,
    "siteEvents",
    ()=>siteEvents,
    "siteRatings",
    ()=>siteRatings,
    "siteRatingsRelations",
    ()=>siteRatingsRelations,
    "siteReports",
    ()=>siteReports,
    "siteTheme",
    ()=>siteTheme,
    "tierlistVotes",
    ()=>tierlistVotes,
    "tierlists",
    ()=>tierlists,
    "tierlistsRelations",
    ()=>tierlistsRelations,
    "urlRedirects",
    ()=>urlRedirects,
    "userPreferences",
    ()=>userPreferences,
    "users",
    ()=>users,
    "usersRelations",
    ()=>usersRelations,
    "wikiCategories",
    ()=>wikiCategories,
    "wikiCategoriesRelations",
    ()=>wikiCategoriesRelations,
    "wikiContributions",
    ()=>wikiContributions,
    "wikiLaunch",
    ()=>wikiLaunch,
    "wikiPages",
    ()=>wikiPages,
    "wikiPagesRelations",
    ()=>wikiPagesRelations,
    "wikiRevisions",
    ()=>wikiRevisions
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$paralleldrive$2b$cuid2$40$3$2e$3$2e$0$2f$node_modules$2f40$paralleldrive$2f$cuid2$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/@paralleldrive+cuid2@3.3.0/node_modules/@paralleldrive/cuid2/index.js [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$paralleldrive$2b$cuid2$40$3$2e$3$2e$0$2f$node_modules$2f40$paralleldrive$2f$cuid2$2f$src$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@paralleldrive+cuid2@3.3.0/node_modules/@paralleldrive/cuid2/src/index.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$relations$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/relations.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/sql/sql.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$bigserial$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/bigserial.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/boolean.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/indexes.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/integer.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/jsonb.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/table.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/text.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/columns/timestamp.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$unique$2d$constraint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/drizzle-orm@0.45.3+2521f1ef6f1fdf12/node_modules/drizzle-orm/pg-core/unique-constraint.js [middleware] (ecmascript)");
;
;
;
const cuid = ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey().$defaultFn(()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$paralleldrive$2b$cuid2$40$3$2e$3$2e$0$2f$node_modules$2f40$paralleldrive$2f$cuid2$2f$src$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["createId"])());
const users = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("User", {
    id: cuid(),
    discordId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("discordId").notNull().unique(),
    username: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("username").notNull(),
    avatar: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("avatar"),
    roleAdmin: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("roleAdmin").notNull().default(false),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const POST_STATUSES = [
    "draft",
    "scheduled",
    "published"
];
const posts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("Post", {
    id: cuid(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    cover: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("cover"),
    excerpt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("excerpt").notNull(),
    /**
     * Corps historique en **Markdown**. Conservé tel quel pour les articles
     * écrits avant l'éditeur riche : tant que `contentHtml` est NULL, c'est lui
     * qui est rendu (via ReactMarkdown). Les articles créés/édités dans le
     * nouvel éditeur y stockent le texte brut extrait du document (recherche,
     * calcul du temps de lecture, repli ultime).
     */ body: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("body").notNull(),
    /** Document Tiptap — source de vérité pour l'ÉDITION. */ contentJson: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("contentJson").$type(),
    /** HTML rendu depuis `contentJson` — source de vérité pour l'AFFICHAGE public. */ contentHtml: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("contentHtml"),
    published: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("published").notNull().default(false),
    status: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("status").$type().notNull().default("draft"),
    /** Date de mise en ligne (peut être future = programmé). NULL tant que brouillon. */ publishedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("publishedAt", {
        precision: 3,
        mode: "date"
    }),
    coverAlt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("coverAlt"),
    coverCaption: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("coverCaption"),
    tags: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("tags").$type().notNull().default([]),
    /** Mise en avant éditoriale (une seule tête d'affiche en haut du journal). */ featured: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("featured").notNull().default(false),
    // --- SEO ---
    seoTitle: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("seoTitle"),
    seoDescription: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("seoDescription"),
    /** Image sociale dédiée. À défaut, `cover` sert d'OG image. */ ogImage: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("ogImage"),
    /** Canonique externe — à poser UNIQUEMENT si l'article est republié depuis ailleurs. */ canonicalUrl: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("canonicalUrl"),
    noindex: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("noindex").notNull().default(false),
    readingMinutes: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("readingMinutes").notNull().default(1),
    wordCount: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("wordCount").notNull().default(0),
    /**
     * Nom de l'agent quand l'article a été déposé par l'API agents. `authorId`
     * reste le membre du staff responsable de la clé — la contrainte de clé
     * étrangère l'exige, et quelqu'un doit répondre du texte. Cette colonne dit
     * l'autre moitié de la vérité : le brouillon a été écrit par une machine.
     */ agentName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("agentName"),
    authorId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("authorId").notNull().references(()=>users.id),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
}, (t)=>[
        // Le journal public trie systématiquement les articles publiés par date de
        // parution décroissante — index composite pour éviter le tri en mémoire.
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("Post_published_publishedAt_idx").on(t.published, t.publishedAt),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("Post_status_idx").on(t.status)
    ]);
const tierlists = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("Tierlist", {
    id: cuid(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    description: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("description"),
    // Clé du template d'origine (pool d'images), ex: "personnages". Null = libre.
    templateKey: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("templateKey"),
    tiers: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("tiers").$type().notNull(),
    published: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("published").notNull().default(true),
    // Tier list « officielle » créée par l'équipe (badge éditorial + curation).
    official: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("official").notNull().default(false),
    // Épinglée / mise en avant (remontée en tête de galerie & accueil). Indépendant
    // d'`official` : une tierlist communautaire remarquable peut être featured.
    featured: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("featured").notNull().default(false),
    authorId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("authorId").notNull().references(()=>users.id),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const tierlistVotes = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("TierlistVote", {
    id: cuid(),
    tierlistId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("tierlistId").notNull().references(()=>tierlists.id, {
        onDelete: "cascade"
    }),
    userId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userId").notNull().references(()=>users.id, {
        onDelete: "cascade"
    }),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$unique$2d$constraint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["unique"])("TierlistVote_tierlist_user_unique").on(t.tierlistId, t.userId)
    ]);
const comments = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("Comment", {
    id: cuid(),
    postId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("postId").notNull().references(()=>posts.id, {
        onDelete: "cascade"
    }),
    authorId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("authorId").notNull().references(()=>users.id),
    body: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("body").notNull(),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const wikiCategories = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("WikiCategory", {
    id: cuid(),
    parentId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("parentId"),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    order: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("order").notNull().default(0)
});
const wikiPages = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("WikiPage", {
    id: cuid(),
    categoryId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("categoryId").notNull().references(()=>wikiCategories.id),
    title: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("title").notNull(),
    slug: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("slug").notNull().unique(),
    body: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("body").notNull(),
    order: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("order").notNull().default(0),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const baUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("ba_user", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    email: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("email").notNull().unique(),
    emailVerified: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("emailVerified").notNull(),
    image: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("image"),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt").notNull(),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt").notNull()
});
const baSession = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("ba_session", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    expiresAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("expiresAt").notNull(),
    token: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("token").notNull().unique(),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt").notNull(),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt").notNull(),
    ipAddress: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("ipAddress"),
    userAgent: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userAgent"),
    userId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userId").notNull().references(()=>baUser.id)
});
const baAccount = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("ba_account", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    accountId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("accountId").notNull(),
    providerId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("providerId").notNull(),
    // Better Auth 1.6 uses issuer to bind OAuth accounts safely.
    issuer: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("issuer"),
    userId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userId").notNull().references(()=>baUser.id),
    accessToken: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("accessToken"),
    refreshToken: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("refreshToken"),
    idToken: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("idToken"),
    accessTokenExpiresAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("accessTokenExpiresAt"),
    refreshTokenExpiresAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("refreshTokenExpiresAt"),
    scope: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("scope"),
    password: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("password"),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt").notNull(),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt").notNull()
});
const baVerification = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("ba_verification", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    identifier: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("identifier").notNull(),
    value: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("value").notNull(),
    expiresAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("expiresAt").notNull(),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt"),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt")
});
const siteEvents = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("site_events", {
    id: cuid(),
    // Horodatage serveur (la source de vérité ; on ignore l'horloge client).
    ts: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("ts", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    // Type d'event (union typée côté client : wiki_view, search, cta_click…).
    type: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("type").notNull(),
    // Utilisateur connecté (Better Auth) — null si anonyme.
    userId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userId"),
    // Pseudonyme stable du visiteur anonyme (cookie httpOnly signé).
    anonId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("anonId").notNull(),
    // Session de navigation (regroupe les events d'une même visite, ~30 min).
    sessionId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("sessionId").notNull(),
    // Entité concernée (character, saga, movie, episode…) + son id, pour la reco.
    entityType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("entityType"),
    entityId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("entityId"),
    // Chemin de la page (sans query string — pas de données perso dans l'URL).
    path: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("path").notNull(),
    // Référent interne/externe normalisé (host seul pour l'externe).
    referrer: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("referrer"),
    // Hash visiteur rotaté quotidiennement (anti-doublon, jamais d'IP brute).
    visitorHash: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("visitorHash"),
    // Propriétés libres typées par event (jsonb).
    props: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("props").$type()
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_events_user_idx").on(t.userId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_events_anon_idx").on(t.anonId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_events_entity_idx").on(t.entityType, t.entityId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_events_type_ts_idx").on(t.type, t.ts),
        // Index analytics (dashboard « Activité du site ») : top pages (path),
        // sources de trafic (referrer), comptage de sessions (sessionId) et séries
        // temporelles globales tous types confondus (ts seul).
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_events_path_idx").on(t.path),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_events_referrer_idx").on(t.referrer),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_events_session_idx").on(t.sessionId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_events_ts_idx").on(t.ts)
    ]);
const userPreferences = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("user_preferences", {
    id: cuid(),
    // Clé d'identité : "u:<userId>" ou "a:<anonId>" (unique).
    identity: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("identity").notNull().unique(),
    userId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userId"),
    anonId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("anonId"),
    // Préférences dérivées : ères favorites, persos/sagas vus, sections,
    // langue, séries préférées… Forme libre, faite évoluer sans migration.
    prefs: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("prefs").$type().notNull().default({}),
    // Nombre d'events agrégés (fraîcheur / poids de confiance).
    eventCount: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("eventCount").notNull().default(0),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("user_preferences_user_idx").on(t.userId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("user_preferences_anon_idx").on(t.anonId)
    ]);
const homeConfig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("HomeConfig", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    data: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("data").$type().notNull(),
    updatedBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("updatedBy"),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const contributionRights = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("ContributionRights", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    data: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("data").$type().notNull(),
    updatedBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("updatedBy"),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const siteTheme = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("SiteTheme", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    data: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("data").$type().notNull(),
    updatedBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("updatedBy"),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const chronologyConfig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("ChronologyConfig", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    data: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("data").$type().notNull(),
    updatedBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("updatedBy"),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const canonConfig = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("CanonConfig", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    data: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("data").$type().notNull(),
    updatedBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("updatedBy"),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const wikiLaunch = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("WikiLaunch", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    data: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("data").$type().notNull(),
    updatedBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("updatedBy"),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const siteReports = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("site_reports", {
    id: cuid(),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    // Rapporteur connecté (users.id cuid) + copies figées pour l'affichage.
    userId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userId"),
    discordId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("discordId"),
    username: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("username"),
    // Contexte de la page signalée.
    path: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("path").notNull(),
    pageTitle: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("pageTitle"),
    // bug | contenu | lien | suggestion | autre
    category: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("category").notNull().default("bug"),
    message: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("message").notNull(),
    userAgent: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userAgent"),
    // Workflow ticket : open | in_progress | resolved | closed
    status: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("status").notNull().default("open"),
    // Note interne de l'équipe (traitement).
    adminNote: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("adminNote"),
    resolvedBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("resolvedBy"),
    resolvedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("resolvedAt", {
        precision: 3,
        mode: "date"
    }),
    visible: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("visible").notNull().default(true)
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_reports_status_idx").on(t.status),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_reports_created_idx").on(t.createdAt),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_reports_user_idx").on(t.userId)
    ]);
const RATING_TARGET_TYPES = [
    "game",
    "episode",
    "movie",
    "arc"
];
const siteRatings = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("site_ratings", {
    id: cuid(),
    // game | episode | movie | arc
    targetType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("targetType").notNull(),
    // id métier stringifié
    targetId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("targetId").notNull(),
    userId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userId").notNull().references(()=>users.id, {
        onDelete: "cascade"
    }),
    // 1..5
    score: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("score").notNull(),
    comment: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("comment"),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$unique$2d$constraint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["unique"])("site_ratings_target_user_unique").on(t.targetType, t.targetId, t.userId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_ratings_target_idx").on(t.targetType, t.targetId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_ratings_user_idx").on(t.userId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("site_ratings_created_idx").on(t.createdAt)
    ]);
const pageBanners = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("PageBanners", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    data: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("data").$type().notNull(),
    updatedBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("updatedBy"),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const urlRedirects = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("url_redirects", {
    sourcePath: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source_path").primaryKey(),
    targetPath: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("target_path").notNull(),
    statusCode: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("status_code").notNull().default(301),
    visible: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("visible").notNull().default(true),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("created_at", {
        precision: 3,
        mode: "date",
        withTimezone: true
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const wikiRevisions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("wiki_revisions", {
    id: cuid(),
    // Table wiki concernée (db_characters, db_sagas…) + pk figée de la ligne
    // (stringifiée ; pk composite jointe par ":").
    tableName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("tableName").notNull(),
    rowId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("rowId").notNull(),
    // create | update | delete | visibility | revert
    action: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("action").notNull(),
    // Libellé lisible de l'entité au moment de l'édit (nom/titre figé).
    label: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("label"),
    // Snapshots des colonnes mutables (null selon l'action).
    before: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("before").$type(),
    after: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("after").$type(),
    // Auteur : users.id + username figé (null pour un edit système/token).
    editorId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("editorId"),
    editorName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("editorName"),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("wiki_revisions_entity_idx").on(t.tableName, t.rowId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("wiki_revisions_created_idx").on(t.createdAt),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("wiki_revisions_editor_idx").on(t.editorId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("wiki_revisions_action_idx").on(t.action)
    ]);
const usersRelations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$relations$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["relations"])(users, ({ many })=>({
        posts: many(posts),
        comments: many(comments),
        tierlists: many(tierlists),
        ratings: many(siteRatings)
    }));
const siteRatingsRelations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$relations$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["relations"])(siteRatings, ({ one })=>({
        author: one(users, {
            fields: [
                siteRatings.userId
            ],
            references: [
                users.id
            ]
        })
    }));
const postsRelations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$relations$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["relations"])(posts, ({ one, many })=>({
        author: one(users, {
            fields: [
                posts.authorId
            ],
            references: [
                users.id
            ]
        }),
        comments: many(comments)
    }));
const tierlistsRelations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$relations$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["relations"])(tierlists, ({ one })=>({
        author: one(users, {
            fields: [
                tierlists.authorId
            ],
            references: [
                users.id
            ]
        })
    }));
const commentsRelations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$relations$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["relations"])(comments, ({ one })=>({
        post: one(posts, {
            fields: [
                comments.postId
            ],
            references: [
                posts.id
            ]
        }),
        author: one(users, {
            fields: [
                comments.authorId
            ],
            references: [
                users.id
            ]
        })
    }));
const wikiCategoriesRelations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$relations$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["relations"])(wikiCategories, ({ one, many })=>({
        parent: one(wikiCategories, {
            fields: [
                wikiCategories.parentId
            ],
            references: [
                wikiCategories.id
            ],
            relationName: "CategoryTree"
        }),
        children: many(wikiCategories, {
            relationName: "CategoryTree"
        }),
        pages: many(wikiPages)
    }));
const wikiPagesRelations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$relations$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["relations"])(wikiPages, ({ one })=>({
        category: one(wikiCategories, {
            fields: [
                wikiPages.categoryId
            ],
            references: [
                wikiCategories.id
            ]
        })
    }));
const editorDrafts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("editor_drafts", {
    id: cuid(),
    // Clé logique du document édité (stable entre deux sessions).
    docKey: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("docKey").notNull(),
    userId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userId").notNull(),
    // "doc" (JSON ProseMirror sérialisé) | "markdown" | "text"
    format: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("format").notNull().default("markdown"),
    content: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("content").notNull(),
    // Libellé lisible pour un futur écran « mes brouillons ».
    label: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("label"),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$unique$2d$constraint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["unique"])("editor_drafts_doc_user_key").on(t.docKey, t.userId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("editor_drafts_user_idx").on(t.userId, t.updatedAt)
    ]);
const CONTRIBUTION_STATUSES = [
    "pending",
    "accepted",
    "rejected",
    /** La valeur en base a changé depuis la proposition → à rebaser, pas à appliquer. */ "superseded",
    /** Retirée par son auteur avant modération. */ "withdrawn"
];
const wikiContributions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("wiki_contributions", {
    id: cuid(),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    // Auteur : users.id + copies figées (le pseudo Discord change, le crédit non).
    authorId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("authorId"),
    authorName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("authorName"),
    authorDiscordId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("authorDiscordId"),
    // Cible : toujours (table wiki, pk figée, colonne mutable).
    tableName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("tableName").notNull(),
    rowId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("rowId").notNull(),
    columnName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("columnName").notNull(),
    /** Libellé lisible de l'entité au moment de la proposition. */ entityLabel: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("entityLabel"),
    /** URL publique de la fiche — retour en un clic depuis la modération. */ entityPath: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("entityPath"),
    /** Valeur en base au moment de la proposition : sert de base de diff ET de
     *  détection de conflit (si elle a bougé, la proposition est `superseded`). */ valueBefore: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("valueBefore"),
    valueAfter: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("valueAfter").notNull(),
    /** Pourquoi ce changement (facultatif). */ comment: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("comment"),
    /** D'où vient l'information : tome + planche, databook + page. */ sources: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("sources"),
    status: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("status").notNull().default("pending"),
    reviewerId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("reviewerId"),
    reviewerName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("reviewerName"),
    reviewNote: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("reviewNote"),
    reviewedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("reviewedAt", {
        precision: 3,
        mode: "date"
    }),
    /** `wiki_revisions.id` produite à l'acceptation (pour annuler d'un clic). */ revisionId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("revisionId")
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("wiki_contributions_status_idx").on(t.status, t.createdAt),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("wiki_contributions_entity_idx").on(t.tableName, t.rowId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("wiki_contributions_author_idx").on(t.authorId, t.createdAt)
    ]);
const canonReferences = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("canon_references", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    subject: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("subject").notNull(),
    keywords: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("keywords").$type().notNull().default([]),
    text: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("text").notNull(),
    textFr: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("text_fr"),
    source: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source").notNull(),
    year: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("year"),
    document: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("document").notNull(),
    lang: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("lang").notNull().default("fr"),
    provenance: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("provenance").notNull().default("manuel"),
    href: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("href"),
    hash: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("hash").notNull(),
    visible: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("visible").notNull().default(true),
    seenAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("seen_at", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("created_at", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updated_at", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const canonVerdicts = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("canon_verdicts", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("id").primaryKey(),
    question: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("question").notNull(),
    tier: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("tier").notNull(),
    score: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("score").notNull(),
    origine: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("origine").notNull(),
    askedCount: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("asked_count").notNull().default(1),
    firstAskedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("first_asked_at", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    lastAskedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("last_asked_at", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
});
const canonIngestRuns = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("canon_ingest_runs", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$bigserial$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["bigserial"])("id", {
        mode: "number"
    }).primaryKey(),
    source: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("source").notNull(),
    startedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("started_at", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    finishedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("finished_at", {
        precision: 3,
        mode: "date"
    }),
    inserted: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("inserted").notNull().default(0),
    updated: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("updated").notNull().default(0),
    unchanged: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("unchanged").notNull().default(0),
    hidden: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("hidden").notNull().default(0),
    error: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("error")
});
const SOCIAL_TARGET_KINDS = [
    "post",
    "wiki",
    "databook",
    "tierlist",
    "comment"
];
const COMMENT_STATUSES = [
    "visible",
    "hidden",
    "deleted"
];
const contentComments = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("ContentComment", {
    id: cuid(),
    targetKind: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("targetKind").$type().notNull(),
    targetId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("targetId").notNull(),
    /** Réponse à un commentaire du même fil. NULL = commentaire racine. */ parentId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("parentId"),
    /** Auteur membre. NULL quand l'auteur est un agent (cf. `agentName`). */ authorId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("authorId").references(()=>users.id, {
        onDelete: "set null"
    }),
    /** Pseudo figé à l'écriture : le crédit ne bouge pas si le compte change. */ authorName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("authorName"),
    /** Nom de la clé d'agent quand le commentaire vient de l'API agents. */ agentName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("agentName"),
    body: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("body").notNull(),
    status: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("status").$type().notNull().default("visible"),
    /** Épinglé par la modération — remonte toujours en tête du fil. */ pinned: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("pinned").notNull().default(false),
    edited: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$boolean$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["boolean"])("edited").notNull().default(false),
    /** Qui a masqué/supprimé, et quand (traçabilité de modération). */ moderatedBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("moderatedBy"),
    moderatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("moderatedAt", {
        precision: 3,
        mode: "date"
    }),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    updatedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("updatedAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
}, (t)=>[
        // Le fil public : cible + tri par date. Index composite pour éviter un tri
        // en mémoire sur les fiches très commentées.
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("ContentComment_target_idx").on(t.targetKind, t.targetId, t.createdAt),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("ContentComment_parent_idx").on(t.parentId, t.createdAt),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("ContentComment_author_idx").on(t.authorId, t.createdAt),
        // File de modération : tous supports confondus, du plus récent au plus vieux.
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("ContentComment_status_idx").on(t.status, t.createdAt)
    ]);
const REACTION_KINDS = [
    "like"
];
const contentReactions = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("ContentReaction", {
    id: cuid(),
    targetKind: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("targetKind").$type().notNull(),
    targetId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("targetId").notNull(),
    userId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("userId").notNull().references(()=>users.id, {
        onDelete: "cascade"
    }),
    kind: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("kind").$type().notNull().default("like"),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
}, (t)=>[
        // Une réaction par (cible, membre, type) : le toggle est un insert/delete,
        // jamais un compteur qu'on incrémente à l'aveugle.
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$unique$2d$constraint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["unique"])("ContentReaction_target_user_kind_key").on(t.targetKind, t.targetId, t.userId, t.kind),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("ContentReaction_target_idx").on(t.targetKind, t.targetId),
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("ContentReaction_user_idx").on(t.userId, t.createdAt)
    ]);
const contentCommentsRelations = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$relations$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["relations"])(contentComments, ({ one, many })=>({
        author: one(users, {
            fields: [
                contentComments.authorId
            ],
            references: [
                users.id
            ]
        }),
        parent: one(contentComments, {
            fields: [
                contentComments.parentId
            ],
            references: [
                contentComments.id
            ],
            relationName: "CommentThread"
        }),
        replies: many(contentComments, {
            relationName: "CommentThread"
        })
    }));
;
const agentKeys = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("AgentKey", {
    id: cuid(),
    /** Nom lisible — il signe publiquement les écritures de l'agent. */ name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("name").notNull(),
    /** 10 premiers caractères du jeton : l'identifier sans le révéler. */ prefix: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("prefix").notNull(),
    /** SHA-256 hex du jeton complet. Jamais le jeton lui-même. */ tokenHash: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("tokenHash").notNull().unique(),
    scopes: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$jsonb$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jsonb"])("scopes").$type().notNull().default([]),
    note: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("note"),
    createdBy: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("createdBy"),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`),
    lastUsedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("lastUsedAt", {
        precision: 3,
        mode: "date"
    }),
    /** Révocation = date posée. On ne supprime pas : l'audit doit rester lisible. */ revokedAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("revokedAt", {
        precision: 3,
        mode: "date"
    }),
    /** Quota d'écritures par heure (NULL = défaut du code). */ rateLimitPerHour: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("rateLimitPerHour")
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("AgentKey_active_idx").on(t.revokedAt, t.createdAt)
    ]);
const agentAudit = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$table$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["pgTable"])("AgentAudit", {
    id: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$bigserial$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["bigserial"])("id", {
        mode: "number"
    }).primaryKey(),
    keyId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("keyId"),
    keyName: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("keyName"),
    method: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("method").notNull(),
    path: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("path").notNull(),
    status: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$integer$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["integer"])("status").notNull(),
    /** Résumé de l'effet (slug créé, id de contribution…) — jamais de secret. */ summary: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$text$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["text"])("summary"),
    createdAt: (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$columns$2f$timestamp$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["timestamp"])("createdAt", {
        precision: 3,
        mode: "date"
    }).notNull().default(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$sql$2f$sql$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sql"]`CURRENT_TIMESTAMP`)
}, (t)=>[
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$drizzle$2d$orm$40$0$2e$45$2e$3$2b$2521f1ef6f1fdf12$2f$node_modules$2f$drizzle$2d$orm$2f$pg$2d$core$2f$indexes$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["index"])("AgentAudit_key_idx").on(t.keyId, t.createdAt)
    ]);
}),
"[project]/packages/db/src/sql.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createSql",
    ()=>createSql,
    "postgresJsOptions",
    ()=>postgresJsOptions,
    "resolvePgClientOptions",
    ()=>resolvePgClientOptions
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Raw postgres-js client. Runtime class: `server`.
 *
 * The client returned here is NEVER handed to `drizzle()`: the Drizzle
 * postgres-js driver replaces the json/jsonb/timestamptz serializers of the
 * client it wraps with identity functions. Raw SQL callers need the postgres-js
 * defaults, hence a distinct pool.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$postgres$40$3$2e$4$2e$9$2f$node_modules$2f$postgres$2f$src$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/postgres@3.4.9/node_modules/postgres/src/index.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/db/src/config.ts [middleware] (ecmascript)");
;
;
function resolvePgClientOptions(options) {
    const env = options.env ?? process.env;
    const max = options.max !== undefined ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolvePoolMax"])(String(options.max)) : (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolvePoolMax"])(env.DATABASE_POOL_MAX);
    return {
        url: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$db$2f$src$2f$config$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["resolveDatabaseUrl"])(options.url ?? env.DATABASE_URL),
        max,
        applicationName: options.applicationName,
        idleTimeoutSeconds: options.idleTimeoutSeconds ?? 30,
        connectTimeoutSeconds: options.connectTimeoutSeconds ?? 5,
        prepare: options.prepare ?? true
    };
}
function postgresJsOptions(resolved) {
    return {
        prepare: resolved.prepare,
        max: resolved.max,
        idle_timeout: resolved.idleTimeoutSeconds,
        connect_timeout: resolved.connectTimeoutSeconds,
        connection: {
            application_name: resolved.applicationName
        }
    };
}
function createSql(options) {
    const resolved = resolvePgClientOptions(options);
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$postgres$40$3$2e$4$2e$9$2f$node_modules$2f$postgres$2f$src$2f$index$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["default"])(resolved.url, postgresJsOptions(resolved));
}
}),
"[project]/packages/lexicon/src/fold.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "codePoints",
    ()=>codePoints,
    "fold",
    ()=>fold,
    "foldChar",
    ()=>foldChar
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Search key of a form, identical to `shenron_lexicon::fold` (fixtures
 * `data/lexicon/fixtures/fold.json`). Per code point:
 *
 * 1. fullwidth ASCII (U+FF01–U+FF5E) becomes ASCII, the ideographic space a space;
 * 2. lowercase (Unicode default mapping, without context);
 * 3. Latin letters lose their diacritics (table below), combining marks are dropped;
 * 4. katakana (U+30A1–U+30F6) become hiragana;
 * 5. only letters and digits are kept (`Kaïō-ken` → `kaioken`, `Mr. Satan` → `mrsatan`).
 *
 * The table is explicit rather than `normalize("NFD")` so the Rust and TypeScript outputs
 * cannot drift with the runtime's Unicode tables.
 */ const ACCENTED = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżž";
const BASE = "aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzz";
const BASE_OF = new Map([
    ...ACCENTED
].map((c, index)=>[
        c,
        BASE[index]
    ]));
const ALPHANUMERIC = /^[\p{Alphabetic}\p{N}]$/u;
function foldChar(c) {
    let out = "";
    for (const lower of c.toLowerCase()){
        const code = lower.codePointAt(0);
        if (code >= 0x300 && code <= 0x36f) continue;
        out += BASE_OF.get(lower) ?? lower;
    }
    return out;
}
function fold(text) {
    let out = "";
    for (const raw of text){
        let code = raw.codePointAt(0);
        if (code >= 0xff01 && code <= 0xff5e) code -= 0xfee0;
        else if (code === 0x3000) code = 0x20;
        for (const c of foldChar(String.fromCodePoint(code))){
            let point = c.codePointAt(0);
            if (point >= 0x30a1 && point <= 0x30f6) point -= 0x60;
            const folded = String.fromCodePoint(point);
            if (ALPHANUMERIC.test(folded)) out += folded;
        }
    }
    return out;
}
function codePoints(text) {
    let n = 0;
    for (const _ of text)n++;
    return n;
}
}),
"[project]/packages/lexicon/src/lexicon.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Lexicon",
    ()=>Lexicon,
    "LexiconError",
    ()=>LexiconError,
    "SEARCH_DEFAULT_LIMIT",
    ()=>SEARCH_DEFAULT_LIMIT,
    "SEARCH_MAX_LIMIT",
    ()=>SEARCH_MAX_LIMIT,
    "validateLexicon",
    ()=>validateLexicon
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * The lexicon: validation, lookup by id or by any form, localisation, search and masking per
 * target language. Same rules as `shenron_lexicon::Lexicon` (fixtures
 * `data/lexicon/fixtures/lexicon.json`).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/lexicon/src/fold.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$mask$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/lexicon/src/mask.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/lexicon/src/types.ts [middleware] (ecmascript)");
;
;
;
const emptyCounts = ()=>({
        ja: 0,
        fr: 0,
        en: 0,
        romaji: 0
    });
const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LIMIT = 100;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function validateLexicon(data) {
    const issues = [];
    const doc = data;
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return [
        "not a lexicon object"
    ];
    if (doc.version !== 1) issues.push(`version must be 1, got ${String(doc.version)}`);
    if (!Array.isArray(doc.terms)) return [
        ...issues,
        "terms is not an array"
    ];
    const ids = new Set();
    const japanese = new Map();
    doc.terms.forEach((term, index)=>{
        const at = `terms[${index}]${term && typeof term.id === "string" ? ` (${term.id})` : ""}`;
        if (!term || typeof term !== "object") {
            issues.push(`${at}: not an object`);
            return;
        }
        const allowed = new Set([
            "id",
            "kind",
            "ja",
            "fr",
            "en",
            "romaji",
            "aliases",
            "sources"
        ]);
        for (const key of Object.keys(term))if (!allowed.has(key)) issues.push(`${at}: unknown field ${key}`);
        if (typeof term.id !== "string" || !ID_PATTERN.test(term.id)) issues.push(`${at}: id must be a lowercase ASCII slug`);
        else if (ids.has(term.id)) issues.push(`${at}: duplicate id`);
        else ids.add(term.id);
        if (!__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["KINDS"].includes(term.kind)) issues.push(`${at}: unknown kind ${String(term.kind)}`);
        for (const lang of __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LANGS"]){
            const value = term[lang];
            if (typeof value !== "string") issues.push(`${at}: ${lang} must be a string`);
            else if (value !== value.trim()) issues.push(`${at}: ${lang} has outer blanks`);
            else if (lang !== "en" && !value) issues.push(`${at}: ${lang} is empty`);
        }
        if (term.romaji !== undefined && (typeof term.romaji !== "string" || !term.romaji.trim())) issues.push(`${at}: romaji must be a non-empty string`);
        const spellings = [
            term.ja,
            ...term.aliases?.ja ?? []
        ];
        if (term.aliases !== undefined) {
            if (typeof term.aliases !== "object" || term.aliases === null || Array.isArray(term.aliases)) issues.push(`${at}: aliases must be an object`);
            else for (const [lang, list] of Object.entries(term.aliases)){
                if (!__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LANGS"].includes(lang)) issues.push(`${at}: aliases.${lang} is not a language`);
                else if (!Array.isArray(list) || list.length === 0 || list.some((v)=>typeof v !== "string" || !v.trim() || v !== v.trim())) issues.push(`${at}: aliases.${lang} must list trimmed non-empty strings`);
                else if (new Set(list).size !== list.length || list.includes(term[lang])) issues.push(`${at}: aliases.${lang} repeats a form`);
            }
        }
        for (const spelling of spellings){
            if (typeof spelling !== "string") continue;
            const owner = japanese.get(spelling);
            if (owner !== undefined && owner !== term.id) issues.push(`${at}: Japanese spelling ${spelling} already belongs to ${owner}`);
            japanese.set(spelling, term.id);
        }
        if (term.sources !== undefined) {
            if (!Array.isArray(term.sources) || term.sources.some((s)=>!s || typeof s.ref !== "string" || !s.ref.trim() || s.lang !== undefined && ![
                    ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LANGS"],
                    "romaji"
                ].includes(s.lang))) issues.push(`${at}: sources must be { lang?, ref } objects`);
        }
    });
    return issues;
}
class LexiconError extends Error {
    issues;
    constructor(issues){
        super(`invalid lexicon: ${issues.slice(0, 5).join("; ")}${issues.length > 5 ? "; …" : ""}`), this.issues = issues;
    }
}
/** Spellings of a term, in resolution order: ja, fr, en, romaji, then aliases (ja, fr, en). */ function formsOf(term) {
    const forms = [];
    for (const lang of __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LANGS"])if (term[lang]) forms.push({
        key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["fold"])(term[lang]),
        field: lang,
        form: term[lang],
        alias: false
    });
    if (term.romaji) forms.push({
        key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["fold"])(term.romaji),
        field: "romaji",
        form: term.romaji,
        alias: true
    });
    for (const lang of __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LANGS"])for (const alias of term.aliases?.[lang] ?? [])forms.push({
        key: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["fold"])(alias),
        field: lang,
        form: alias,
        alias: true
    });
    return forms.filter((form)=>form.key !== "");
}
/** Score of one form against a folded query (0: no match). */ function scoreOf(form, query) {
    if (form.key === query) return form.alias ? 90 : 100;
    if (form.key.startsWith(query)) return form.alias ? 60 : 70;
    if (form.key.includes(query)) return form.alias ? 40 : 50;
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["codePoints"])(form.key) >= 2 && query.includes(form.key)) return 20;
    return 0;
}
class Lexicon {
    version;
    terms;
    #byId;
    #forms;
    constructor(data){
        this.version = data.version;
        this.terms = data.terms;
        this.#byId = new Map(data.terms.map((term)=>[
                term.id,
                term
            ]));
        this.#forms = data.terms.map(formsOf);
    }
    /** Validate then build; throws `LexiconError` with every issue. */ static parse(data) {
        const issues = validateLexicon(data);
        if (issues.length) throw new LexiconError(issues);
        return new Lexicon(data);
    }
    get size() {
        return this.terms.length;
    }
    get(id) {
        return this.#byId.get(id);
    }
    /**
   * The term an id or a form designates: the id first, then an exact folded match on a main
   * form (ja, fr, en), the romanisation, then an alias; the first term in data order wins a tie.
   */ resolve(idOrForm) {
        const byId = this.#byId.get(idOrForm.trim().toLowerCase());
        if (byId) return byId;
        const key = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["fold"])(idOrForm);
        if (!key) return undefined;
        for (const pass of [
            false,
            true
        ]){
            for(let index = 0; index < this.terms.length; index++){
                const hit = this.#forms[index].some((form)=>form.alias === pass && form.key === key);
                if (hit) return this.terms[index];
            }
        }
        return undefined;
    }
    /** Form of `term` in `lang`; the English form falls back to the French one while it is missing. */ label(term, lang) {
        const text = term[lang];
        if (text) return {
            text,
            lang,
            fallback: false
        };
        return {
            text: term.fr,
            lang: "fr",
            fallback: true
        };
    }
    /** Terms matching `query` in any language, best first (score, shortest form, id). */ search(query, options = {}) {
        const key = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["fold"])(query);
        if (!key) return [];
        const limit = Math.min(SEARCH_MAX_LIMIT, Math.max(1, Math.trunc(options.limit ?? SEARCH_DEFAULT_LIMIT)));
        const hits = [];
        this.terms.forEach((term, index)=>{
            if (options.kind && term.kind !== options.kind) return;
            let best = null;
            for (const form of this.#forms[index]){
                const score = scoreOf(form, key);
                if (score === 0) continue;
                const length = (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["codePoints"])(form.key);
                if (!best || score > best.score || score === best.score && length < best.length) best = {
                    term,
                    score,
                    field: form.field,
                    form: form.form,
                    alias: form.alias,
                    length
                };
            }
            if (best) hits.push(best);
        });
        const ranked = hits.toSorted((a, b)=>b.score - a.score || a.length - b.length || (a.term.id < b.term.id ? -1 : a.term.id > b.term.id ? 1 : 0));
        return ranked.slice(0, limit).map(({ length: _length, ...hit })=>hit);
    }
    /** Masking entries towards `target`: Japanese spellings (main form and aliases) → target form. */ maskEntries(target) {
        return this.terms.map((term)=>({
                sources: [
                    term.ja,
                    ...term.aliases?.ja ?? []
                ],
                target: term[target],
                value: term
            }));
    }
    /** Mask the Japanese terms of `text` for a translation into `target`. */ mask(text, target, options = {}) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$mask$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["maskText"])(text, this.maskEntries(target), options);
    }
    /**
   * Rows of the legacy `data/lexique-db-canonique.json`: one per Japanese spelling, longest
   * first, then by spelling (root collation, the order the file always had).
   */ legacyEntries() {
        const rows = [];
        for (const term of this.terms){
            for (const ja of [
                term.ja,
                ...term.aliases?.ja ?? []
            ]){
                rows.push({
                    ja,
                    fr: term.fr,
                    kind: __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LEGACY_KIND"][term.kind],
                    length: (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["codePoints"])(ja)
                });
            }
        }
        const collator = new Intl.Collator("und");
        return rows.toSorted((a, b)=>b.length - a.length || collator.compare(a.ja, b.ja));
    }
    coverage() {
        const fields = [
            ...__TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$types$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["LANGS"],
            "romaji"
        ];
        const coverage = {
            total: this.terms.length,
            filled: emptyCounts(),
            byKind: {}
        };
        for (const term of this.terms){
            const kind = coverage.byKind[term.kind] ??= {
                total: 0,
                ...emptyCounts()
            };
            kind.total++;
            for (const field of fields){
                if (term[field]) {
                    coverage.filled[field]++;
                    kind[field]++;
                }
            }
        }
        return coverage;
    }
}
}),
"[project]/packages/lexicon/src/mask.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DEFAULT_TOKEN_PREFIX",
    ()=>DEFAULT_TOKEN_PREFIX,
    "DEFAULT_TOKEN_WIDTH",
    ()=>DEFAULT_TOKEN_WIDTH,
    "findOccurrences",
    ()=>findOccurrences,
    "findTokens",
    ()=>findTokens,
    "maskText",
    ()=>maskText,
    "restoreTokens",
    ()=>restoreTokens,
    "tokenOf",
    ()=>tokenOf,
    "wordEdges",
    ()=>wordEdges
]);
// SPDX-License-Identifier: Apache-2.0
/**
 * Term protection around a translation engine, identical to `shenron_lexicon::mask`
 * (fixtures `data/lexicon/fixtures/{mask,restore,tokens}.json`).
 *
 * - **Masking**: the source spellings found in the text are replaced, longest first, in one pass
 *   and without overlap, by numbered tokens (`Zeta001`). Katakana and Latin spellings only match
 *   on word edges (`セル` is not masked inside `カプセル`); kanji and kana particles carry no edge
 *   (`悟空達`, `ベジータは`). An entry keeps the same token everywhere; past the token budget the
 *   next entries stay in clear and are counted in `overflow`.
 * - **Restoration**: every token the engine returned, whatever it made of it (`Zêta001`,
 *   `ZETA 001`, `Zeta-001`), is replaced by its target form. A form already written next to its
 *   token (`la Terre Zeta003`) is not doubled. Tokens the table does not know (inventions) stay
 *   in clear and are reported in `unresolved`; table tokens absent from the translation are
 *   reported in `missing`.
 *
 * Offsets are code points, never UTF-16 units.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/lexicon/src/fold.ts [middleware] (ecmascript)");
;
const DEFAULT_TOKEN_PREFIX = "Zeta";
const DEFAULT_TOKEN_WIDTH = 3;
function charClass(c) {
    if (c === undefined) return null;
    const code = c.codePointAt(0);
    if (code >= 0x30a1 && code <= 0x30fa || code >= 0x30fc && code <= 0x30ff || code >= 0x31f0 && code <= 0x31ff || code >= 0xff66 && code <= 0xff9f) return "katakana";
    if (code >= 0x30 && code <= 0x39 || code >= 0x41 && code <= 0x5a || code >= 0x61 && code <= 0x7a || code >= 0xc0 && code <= 0x24f) return "latin";
    return null;
}
function wordEdges(chars, start, end) {
    const first = charClass(chars[start]);
    if (first && start > 0 && charClass(chars[start - 1]) === first) return false;
    const last = charClass(chars[end - 1]);
    if (last && charClass(chars[end]) === last) return false;
    return true;
}
function sameChars(chars, at, source) {
    if (at + source.length > chars.length) return false;
    for(let k = 0; k < source.length; k++)if (chars[at + k] !== source[k]) return false;
    return true;
}
/** Entries that can be masked: a non-empty target and spellings of at least two code points. */ function patterns(entries) {
    const byInitial = new Map();
    entries.forEach((entry, index)=>{
        if (!entry.target) return;
        for (const source of entry.sources){
            const chars = [
                ...source
            ];
            if (chars.length < 2) continue;
            const list = byInitial.get(chars[0]) ?? [];
            list.push([
                chars,
                source,
                index
            ]);
            byInitial.set(chars[0], list);
        }
    });
    return byInitial;
}
function findOccurrences(text, entries) {
    return occurrencesIn([
        ...text
    ], entries);
}
function occurrencesIn(chars, entries) {
    const byInitial = patterns(entries);
    const candidates = [];
    chars.forEach((initial, start)=>{
        for (const [source, spelling, index] of byInitial.get(initial) ?? []){
            const end = start + source.length;
            if (sameChars(chars, start, source) && wordEdges(chars, start, end)) {
                candidates.push({
                    start,
                    end,
                    source: spelling,
                    index,
                    entry: entries[index]
                });
            }
        }
    });
    const ordered = candidates.toSorted((a, b)=>b.end - b.start - (a.end - a.start) || a.start - b.start);
    const taken = new Uint8Array(chars.length);
    const kept = [];
    for (const candidate of ordered){
        let free = true;
        for(let k = candidate.start; k < candidate.end; k++){
            if (taken[k]) {
                free = false;
                break;
            }
        }
        if (!free) continue;
        taken.fill(1, candidate.start, candidate.end);
        kept.push(candidate);
    }
    return kept.toSorted((a, b)=>a.start - b.start);
}
function width(options) {
    const value = options.width ?? DEFAULT_TOKEN_WIDTH;
    return Math.min(9, Math.max(1, Math.trunc(value)));
}
function prefix(options) {
    return options.prefix || DEFAULT_TOKEN_PREFIX;
}
function tokenOf(n, options = {}) {
    return `${prefix(options)}${String(n).padStart(width(options), "0")}`;
}
function maskText(text, entries, options = {}) {
    const ceiling = 10 ** width(options) - 1;
    const max = Math.min(options.maxTokens ?? ceiling, ceiling);
    const chars = [
        ...text
    ];
    const tokens = [];
    const slotOf = new Map();
    let overflow = 0;
    let out = "";
    let cursor = 0;
    for (const occurrence of occurrencesIn(chars, entries)){
        let slot = slotOf.get(occurrence.index);
        if (slot === undefined) {
            if (tokens.length >= max) {
                slot = null;
                overflow++;
            } else {
                slot = tokens.length;
                tokens.push({
                    token: tokenOf(slot + 1, options),
                    number: slot + 1,
                    target: occurrence.entry.target,
                    index: occurrence.index,
                    entry: occurrence.entry
                });
            }
            slotOf.set(occurrence.index, slot);
        }
        if (slot === null) continue;
        out += chars.slice(cursor, occurrence.start).join("") + tokens[slot].token;
        cursor = occurrence.end;
    }
    out += chars.slice(cursor).join("");
    return {
        text: out,
        tokens,
        overflow
    };
}
const WHITE_SPACE = /^\p{White_Space}$/u;
const isDigit = (c)=>c !== undefined && c >= "0" && c <= "9";
/** A token at `start`: folded prefix, at most one separator, then its digits. */ function tokenAt(chars, start, folded, fixed) {
    let i = start;
    for (const expected of folded){
        const c = chars[i];
        if (c === undefined || [
            ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["foldChar"])(c)
        ][0] !== expected) return null;
        i++;
    }
    const separator = chars[i];
    if (separator !== undefined && (separator === "-" || separator === "_" || WHITE_SPACE.test(separator))) i++;
    const digitsStart = i;
    if (fixed !== undefined) {
        for(let k = 0; k < fixed; k++)if (!isDigit(chars[digitsStart + k])) return null;
        i = digitsStart + fixed;
    } else {
        while(isDigit(chars[i]))i++;
        const digits = i - digitsStart;
        if (digits < 3 || digits > 4) return null;
    }
    return {
        end: i,
        number: Number(chars.slice(digitsStart, i).join(""))
    };
}
function foldedPrefix(options) {
    return [
        ...prefix(options)
    ].map((c)=>[
            ...(0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$lexicon$2f$src$2f$fold$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["foldChar"])(c)
        ][0]);
}
function findTokens(text, options = {}) {
    return scanTokens([
        ...text
    ], foldedPrefix(options), options.width === undefined ? undefined : width(options));
}
function scanTokens(chars, folded, fixed) {
    const found = [];
    let i = 0;
    while(i < chars.length){
        const hit = tokenAt(chars, i, folded, fixed);
        if (hit) {
            found.push(chars.slice(i, hit.end).join(""));
            i = hit.end;
        } else i++;
    }
    return found;
}
const isWordChar = (c)=>c !== undefined && /^[\p{Alphabetic}\p{N}]$/u.test(c);
function sameFolded(left, right) {
    return left.length === right.length && left.every((c, k)=>c.toLowerCase() === right[k].toLowerCase());
}
const trimBlanksEnd = (s)=>s.replace(/[ \t]+$/, "");
/** `out` ends with the word `form` (up to trailing blanks), not as the tail of a longer word. */ function endsWithWord(out, form) {
    const trimmed = [
        ...trimBlanksEnd(out)
    ];
    const start = trimmed.length - form.length;
    if (start < 0) return false;
    return sameFolded(trimmed.slice(start), form) && (start === 0 || !isWordChar(trimmed[start - 1]));
}
/** `chars[from..]` starts with the word `form` (after blanks), not as a prefix of a longer word. */ function startsWithWord(chars, from, form) {
    let i = from;
    while(chars[i] === " " || chars[i] === "\t")i++;
    if (i + form.length > chars.length) return false;
    return sameFolded(chars.slice(i, i + form.length), form) && !isWordChar(chars[i + form.length]);
}
/** Number carried by a token key: its trailing ASCII digits. */ function numberOf(token) {
    const match = /(\d+)$/.exec(token);
    return match ? Number(match[1]) : null;
}
function restoreTokens(translation, table, options = {}) {
    const forms = new Map();
    for (const [token, form] of table){
        const number = numberOf(token);
        if (number !== null && !forms.has(number)) forms.set(number, {
            token,
            form
        });
    }
    const folded = foldedPrefix(options);
    const fixed = options.width === undefined ? undefined : width(options);
    const chars = [
        ...translation
    ];
    const seen = new Set();
    let out = "";
    let i = 0;
    while(i < chars.length){
        const hit = tokenAt(chars, i, folded, fixed);
        if (!hit) {
            out += chars[i];
            i++;
            continue;
        }
        const known = forms.get(hit.number);
        if (!known) {
            out += chars.slice(i, hit.end).join("");
            i = hit.end;
            continue;
        }
        seen.add(hit.number);
        const form = [
            ...known.form
        ];
        if (endsWithWord(out, form)) {
            out = trimBlanksEnd(out);
            i = hit.end;
        } else if (startsWithWord(chars, hit.end, form)) {
            i = hit.end;
            while(chars[i] === " " || chars[i] === "\t")i++;
        } else {
            out += known.form;
            i = hit.end;
        }
    }
    const unresolved = [
        ...new Set(scanTokens([
            ...out
        ], folded, fixed))
    ];
    const missing = [
        ...forms
    ].filter(([number])=>!seen.has(number)).map(([, { token }])=>token);
    return {
        text: out,
        unresolved,
        missing
    };
}
}),
"[project]/packages/lexicon/src/types.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// SPDX-License-Identifier: Apache-2.0
/**
 * Shapes of the canonical Dragon Ball lexicon (`data/lexicon/terms.json`, schema
 * `data/lexicon/terms.schema.json`). The Rust crate `shenron-lexicon` reads the same file.
 */ /** Languages of a term. Japanese is the source of the masking; French and English are targets. */ __turbopack_context__.s([
    "KINDS",
    ()=>KINDS,
    "LANGS",
    ()=>LANGS,
    "LEGACY_KIND",
    ()=>LEGACY_KIND
]);
const LANGS = [
    "ja",
    "fr",
    "en"
];
const KINDS = [
    "character",
    "technique",
    "transformation",
    "race",
    "place",
    "item",
    "event",
    "title",
    "saga",
    "arc",
    "organization",
    "other"
];
const LEGACY_KIND = {
    character: "personnage",
    technique: "technique",
    transformation: "transformation",
    race: "race",
    place: "planete",
    item: "autre",
    event: "autre",
    title: "autre",
    saga: "saga",
    arc: "arc",
    organization: "autre",
    other: "autre"
};
}),
"[project]/packages/pipeline/src/bxc/contracts.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BxcFramesStatsSchema",
    ()=>BxcFramesStatsSchema,
    "BxcSearchOutputSchema",
    ()=>BxcSearchOutputSchema,
    "BxcVectorOutputSchema",
    ()=>BxcVectorOutputSchema,
    "DbcnPageItemSchema",
    ()=>DbcnPageItemSchema,
    "DbcnSinglePageViewSchema",
    ()=>DbcnSinglePageViewSchema,
    "DbcnVolumeInfoSchema",
    ()=>DbcnVolumeInfoSchema,
    "DbcnVolumeItemSchema",
    ()=>DbcnVolumeItemSchema,
    "FrameMatchPreviewSchema",
    ()=>FrameMatchPreviewSchema,
    "FrameMatchSchema",
    ()=>FrameMatchSchema,
    "WEB_PATHS",
    ()=>WEB_PATHS,
    "WebCapability",
    ()=>WebCapability,
    "WebFrameSearch",
    ()=>WebFrameSearch,
    "WebImage",
    ()=>WebImage,
    "WebMediaResolve",
    ()=>WebMediaResolve,
    "WebMediaResults",
    ()=>WebMediaResults,
    "WebMediaSearch",
    ()=>WebMediaSearch,
    "WebMediaSource",
    ()=>WebMediaSource,
    "WebStatus",
    ()=>WebStatus
]);
// SPDX-License-Identifier: Apache-2.0
/** Pure wire schemas shared by the native Web owner and Node consumers. */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .enum>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .object>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .string>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .array>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .number>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .record>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/external.js [middleware] (ecmascript) <export * as z .unknown>");
;
const WEB_PATHS = {
    status: "/api/v1/web/status",
    framesStats: "/api/v1/web/frames/stats",
    framesVector: "/api/v1/web/frames/vector",
    framesSearch: "/api/v1/web/frames/search",
    mediaResolve: "/api/v1/web/media/resolve",
    mediaSearch: "/api/v1/web/media/search"
};
const WebCapability = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
    "frames-stats",
    "frames-vector",
    "frames-search",
    "media-resolve",
    "media-search"
]);
const WebStatus = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    version: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(1),
    capabilities: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(WebCapability)
});
const WebImage = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    imageBase64: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().min(4).max(24 * 1024 * 1024).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
});
const WebFrameSearch = WebImage.extend({
    mode: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$enum$3e$__["z"].enum([
        "--local",
        "--remote"
    ]).default("--local"),
    limit: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().int().positive().max(100).optional()
});
const WebMediaResolve = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().url().refine((value)=>{
        const url = new URL(value);
        return [
            "http:",
            "https:"
        ].includes(url.protocol) && !url.username && !url.password;
    })
});
const WebMediaSearch = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    query: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().trim().min(1).max(512)
});
const WebMediaSource = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    host: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    originalUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    directUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    hlsUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    qualities: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()).optional(),
    headers: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$record$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string()).optional()
});
const WebMediaResults = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    animesama: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown()),
    voiranime: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$unknown$3e$__["z"].unknown())
});
const DbcnVolumeItemSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    category: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    categoryTitle: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    arc: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    coverUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    date: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional()
});
const DbcnPageItemSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    pageNumber: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default(""),
    size: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().optional(),
    thumbUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default(""),
    imageUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default(""),
    pageUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default("")
});
const DbcnVolumeInfoSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    totalPages: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    pages: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(DbcnPageItemSchema).default([])
});
const DbcnSinglePageViewSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    pageNumber: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default(""),
    thumbUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default(""),
    imageUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default(""),
    pageUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default("")
});
const FrameMatchPreviewSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    image: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default(""),
    video: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default("")
});
const FrameMatchSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    episode: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().nullable().optional(),
    season: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().nullable().optional(),
    fromMs: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().default(0),
    atMs: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().default(0),
    toMs: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().default(0),
    similarity: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().default(0),
    source: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default(""),
    anilist: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number().default(0),
    preview: FrameMatchPreviewSchema.default({
        image: "",
        video: ""
    })
});
const BxcSearchOutputSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    origin: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string().default("local"),
    matches: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(FrameMatchSchema).default([]),
    quota: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
        used: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
        total: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
    }).optional()
});
const BxcVectorOutputSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    hash: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    vector: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$array$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number())
});
const BxcFramesStatsSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$object$3e$__["z"].object({
    path: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$string$3e$__["z"].string(),
    media: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    frames: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number(),
    durationMs: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z__$2e$number$3e$__["z"].number()
});
}),
]})(),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("fs", () => require("node:fs"));

module.exports = mod;
}),
"[externals]/net [external] (net, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("net", () => require("node:net"));

module.exports = mod;
}),
"[externals]/next/dist/build/adapter/setup-node-env.external.js [external] (next/dist/build/adapter/setup-node-env.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/build/adapter/setup-node-env.external.js", () => require("next/dist/build/adapter/setup-node-env.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/memory-cache.external.js [external] (next/dist/server/lib/incremental-cache/memory-cache.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/memory-cache.external.js", () => require("next/dist/server/lib/incremental-cache/memory-cache.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/shared-cache-controls.external.js [external] (next/dist/server/lib/incremental-cache/shared-cache-controls.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js", () => require("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/tags-manifest.external.js [external] (next/dist/server/lib/incremental-cache/tags-manifest.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/tags-manifest.external.js", () => require("next/dist/server/lib/incremental-cache/tags-manifest.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/router-utils/instrumentation-globals.external.js [external] (next/dist/server/lib/router-utils/instrumentation-globals.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/router-utils/instrumentation-globals.external.js", () => require("next/dist/server/lib/router-utils/instrumentation-globals.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/os [external] (os, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("os", () => require("node:os"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/perf_hooks [external] (perf_hooks, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("perf_hooks", () => require("node:perf_hooks"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/tls [external] (tls, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("tls", () => require("node:tls"));

module.exports = mod;
}),
];