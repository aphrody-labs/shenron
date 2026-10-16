(()=>{"use strict";module.exports = [
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/context/store-capabilities.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "hasServerSessionStore",
    ()=>hasServerSessionStore,
    "shouldBindAccountCookieToSessionUser",
    ()=>shouldBindAccountCookieToSessionUser
]);
//#region src/context/store-capabilities.ts
function hasServerSessionStore(options) {
    return !!options.database || !!options.secondaryStorage;
}
function hasServerAccountStore(options) {
    return !!options.database;
}
function shouldBindAccountCookieToSessionUser(options) {
    return hasServerAccountStore(options);
}
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/cache.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "parseCompactCookieCache",
    ()=>parseCompactCookieCache,
    "parseCookieCachePayload",
    ()=>parseCookieCachePayload
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$db$2f$schema$2f$session$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/db/schema/session.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$db$2f$schema$2f$user$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/db/schema/user.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$logger$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/env/logger.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$json$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/utils/json.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/schemas.js [middleware] (ecmascript)");
;
;
;
;
//#region src/cookies/cache.ts
const cookieCachePayloadSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["looseObject"]({
    session: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$db$2f$schema$2f$session$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["sessionSchema"].loose(),
    user: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$db$2f$schema$2f$user$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["userSchema"].loose(),
    updatedAt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["number"](),
    version: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["string"]().optional()
});
const compactCookieCacheSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["object"]({
    session: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["record"](__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["string"](), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["unknown"]()),
    expiresAt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["number"](),
    signature: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["string"]()
});
function parseCookieCachePayload(value) {
    const parsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$json$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["safeJSONParse"])(value);
    if (parsed === null) return null;
    const result = cookieCachePayloadSchema.safeParse(parsed);
    if (result.success) return result.data;
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$logger$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["logger"].warn("Cookie cache payload failed schema validation", {
        issues: result.error.issues.map(({ code, path })=>({
                code,
                path
            }))
    });
    return null;
}
function parseCompactCookieCache(value) {
    const result = compactCookieCacheSchema.safeParse(value);
    return result.success ? result.data : null;
}
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/cookie-utils.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HOST_COOKIE_PREFIX",
    ()=>HOST_COOKIE_PREFIX,
    "SECURE_COOKIE_PREFIX",
    ()=>SECURE_COOKIE_PREFIX,
    "applySetCookies",
    ()=>applySetCookies,
    "cookieNameRegex",
    ()=>cookieNameRegex,
    "parseCookies",
    ()=>parseCookies,
    "parseSetCookieHeader",
    ()=>parseSetCookieHeader,
    "setCookieToHeader",
    ()=>setCookieToHeader,
    "setRequestCookie",
    ()=>setRequestCookie,
    "splitSetCookieHeader",
    ()=>splitSetCookieHeader,
    "stripSecureCookiePrefix",
    ()=>stripSecureCookiePrefix,
    "toCookieOptions",
    ()=>toCookieOptions
]);
//#region src/cookies/cookie-utils.ts
function tryDecode(str) {
    if (str.indexOf("%") === -1) return str;
    try {
        return decodeURIComponent(str);
    } catch  {
        return str;
    }
}
const SECURE_COOKIE_PREFIX = "__Secure-";
const HOST_COOKIE_PREFIX = "__Host-";
/**
* Remove __Secure- or __Host- prefix from cookie name.
*/ function stripSecureCookiePrefix(cookieName) {
    if (cookieName.startsWith("__Secure-")) return cookieName.slice(9);
    if (cookieName.startsWith("__Host-")) return cookieName.slice(7);
    return cookieName;
}
/**
* Split a comma-joined `Set-Cookie` header string into individual cookies.
*/ function splitSetCookieHeader(setCookie) {
    if (!setCookie) return [];
    const result = [];
    let start = 0;
    let i = 0;
    while(i < setCookie.length){
        if (setCookie[i] === ",") {
            let j = i + 1;
            while(j < setCookie.length && setCookie[j] === " ")j++;
            while(j < setCookie.length && setCookie[j] !== "=" && setCookie[j] !== ";" && setCookie[j] !== ",")j++;
            if (j < setCookie.length && setCookie[j] === "=") {
                const part = setCookie.slice(start, i).trim();
                if (part) result.push(part);
                start = i + 1;
                while(start < setCookie.length && setCookie[start] === " ")start++;
                i = start;
                continue;
            }
        }
        i++;
    }
    const last = setCookie.slice(start).trim();
    if (last) result.push(last);
    return result;
}
function parseSetCookieHeader(setCookie) {
    const cookies = /* @__PURE__ */ new Map();
    splitSetCookieHeader(setCookie).forEach((cookieString)=>{
        const [nameValue, ...attributes] = cookieString.split(";").map((part)=>part.trim());
        const [name, ...valueParts] = (nameValue || "").split("=");
        const value = unquoteCookieValue(valueParts.join("="));
        if (!name) return;
        const attrObj = {
            value: tryDecode(value)
        };
        attributes.forEach((attribute)=>{
            const [attrName, ...attrValueParts] = attribute.split("=");
            const attrValue = attrValueParts.join("=");
            const normalizedAttrName = attrName.trim().toLowerCase();
            switch(normalizedAttrName){
                case "max-age":
                    attrObj["max-age"] = attrValue ? parseInt(attrValue.trim(), 10) : void 0;
                    break;
                case "expires":
                    attrObj.expires = attrValue ? new Date(attrValue.trim()) : void 0;
                    break;
                case "domain":
                    attrObj.domain = attrValue ? attrValue.trim() : void 0;
                    break;
                case "path":
                    attrObj.path = attrValue ? attrValue.trim() : void 0;
                    break;
                case "secure":
                    attrObj.secure = true;
                    break;
                case "httponly":
                    attrObj.httponly = true;
                    break;
                case "samesite":
                    attrObj.samesite = attrValue ? attrValue.trim().toLowerCase() : void 0;
                    break;
                case "partitioned":
                    attrObj.partitioned = true;
                    break;
                default:
                    attrObj[normalizedAttrName] = attrValue ? attrValue.trim() : true;
                    break;
            }
        });
        cookies.set(name, attrObj);
    });
    return cookies;
}
function toCookieOptions(attributes) {
    return {
        maxAge: attributes["max-age"],
        expires: attributes.expires,
        domain: attributes.domain,
        path: attributes.path,
        secure: attributes.secure,
        httpOnly: attributes.httponly,
        sameSite: attributes.samesite,
        partitioned: attributes.partitioned
    };
}
/**
* Cookie-name token char set per RFC 7230 §3.2.6.
*
* @see https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.6
*/ const cookieNameRegex = /^[\x21\x23-\x27\x2A\x2B\x2D\x2E\x30-\x39\x41-\x5A\x5E\x5F\x60\x61-\x7A\x7C\x7E]+$/;
/**
* Cookie-value char set per RFC 6265 §4.1.1, plus space and comma.
*
* @see https://datatracker.ietf.org/doc/html/rfc6265#section-4.1.1
* @see https://github.com/golang/go/issues/7243
*/ const cookieValueRegex = /^[\x20\x21\x23-\x3A\x3C-\x5B\x5D-\x7E]*$/;
/**
* Strip surrounding double-quotes per RFC 6265 §4.1.1 quoted-string form.
*
* @see https://datatracker.ietf.org/doc/html/rfc6265#section-4.1.1
*/ function unquoteCookieValue(value) {
    if (value.length < 2 || !value.startsWith("\"") || !value.endsWith("\"")) return value;
    return value.slice(1, -1);
}
/**
* Trim leading/trailing OWS (space / horizontal tab) per RFC 7230 §3.2.3.
* Narrower than `String.prototype.trim()`, which strips CR/LF and other
* whitespace and would let CTLs escape `cookieValueRegex`.
*
* @see https://datatracker.ietf.org/doc/html/rfc7230#section-3.2.3
*/ function trimOWS(s) {
    let start = 0;
    let end = s.length;
    while(start < end){
        const c = s.charCodeAt(start);
        if (c !== 32 && c !== 9) break;
        start++;
    }
    while(end > start){
        const c = s.charCodeAt(end - 1);
        if (c !== 32 && c !== 9) break;
        end--;
    }
    return start === 0 && end === s.length ? s : s.slice(start, end);
}
/**
* Tolerates `;` separators without the SP that RFC 6265 §4.2.1 mandates,
* since proxies and runtimes commonly strip it. Silently drops entries
* whose name violates RFC 7230 token or whose value violates RFC 6265
* cookie-octet (plus space and comma). Strips optional surrounding
* double-quotes per RFC 6265 §4.1.1.
*/ function parseCookies(cookie) {
    const cookieMap = /* @__PURE__ */ new Map();
    if (cookie.length < 2) return cookieMap;
    for (const chunk of cookie.split(";")){
        const eq = chunk.indexOf("=");
        if (eq === -1) continue;
        const key = trimOWS(chunk.slice(0, eq));
        const val = unquoteCookieValue(trimOWS(chunk.slice(eq + 1)));
        if (cookieNameRegex.test(key) && cookieValueRegex.test(val)) cookieMap.set(key, tryDecode(val));
    }
    return cookieMap;
}
/**
* Add or replace a cookie in the request `Cookie` header.
*
* Cookie pairs are joined with `; `, but `headers.append("cookie", ...)`
* joins with `, ` in some runtimes (e.g. Deno, Cloudflare Workers) and
* breaks downstream cookie parsing. This builds the header value via
* parse-mutate-serialize.
*/ function setRequestCookie(headers, name, value) {
    const cookieMap = parseCookies(headers.get("cookie") || "");
    if (cookieNameRegex.test(name)) cookieMap.set(name, value);
    headers.set("cookie", Array.from(cookieMap, ([k, v])=>`${k}=${encodeURIComponent(v)}`).join("; "));
}
/**
* Merge `Set-Cookie` header values into the target's `Cookie` header.
* Mutates `target`.
*
* Name/value-level merge only. RFC 6265 §5 user-agent semantics
* (expiration, domain/path scoping, ordering) are out of scope. Suitable
* for single-request proxy, middleware, and test contexts.
*/ function applySetCookies(target, setCookieValues) {
    const cookieMap = parseCookies(target.get("cookie") || "");
    for (const setCookie of setCookieValues)for (const [name, attr] of parseSetCookieHeader(setCookie))if (cookieNameRegex.test(name)) cookieMap.set(name, attr.value);
    target.set("cookie", Array.from(cookieMap, ([k, v])=>`${k}=${encodeURIComponent(v)}`).join("; "));
}
function setCookieToHeader(headers) {
    return (context)=>{
        const setCookieHeader = context.response.headers.get("set-cookie");
        if (!setCookieHeader) return;
        applySetCookies(headers, [
            setCookieHeader
        ]);
    };
}
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/index.mjs [middleware] (ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createCookieGetter",
    ()=>createCookieGetter,
    "decodeCookieCache",
    ()=>decodeCookieCache,
    "deleteSessionCookie",
    ()=>deleteSessionCookie,
    "expireCookie",
    ()=>expireCookie,
    "getCookieCache",
    ()=>getCookieCache,
    "getCookies",
    ()=>getCookies,
    "getSessionCookie",
    ()=>getSessionCookie,
    "setCookieCache",
    ()=>setCookieCache,
    "setSessionCookie",
    ()=>setSessionCookie
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$url$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/url.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$context$2f$store$2d$capabilities$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/context/store-capabilities.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/crypto/jwt.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$db$2f$schema$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/db/schema.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$date$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/date.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$is$2d$promise$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/is-promise.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$time$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/time.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/cache.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/cookie-utils.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/jwt.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$session$2d$store$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/session-store.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/env/env-impl.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/error/index.mjs [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$json$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/utils/json.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$db$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/utils/db.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$base64$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/base64.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$binary$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/binary.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$hmac$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+utils@0.4.2/node_modules/@better-auth/utils/dist/hmac.mjs [middleware] (ecmascript)");
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
;
;
//#region src/cookies/index.ts
function createCookieGetter(options) {
    const baseURLString = typeof options.baseURL === "string" ? options.baseURL : void 0;
    const dynamicProtocol = typeof options.baseURL === "object" && options.baseURL !== null ? options.baseURL.protocol : void 0;
    const secureCookiePrefix = (options.advanced?.useSecureCookies !== void 0 ? options.advanced?.useSecureCookies : dynamicProtocol === "https" ? true : dynamicProtocol === "http" ? false : baseURLString ? baseURLString.startsWith("https://") : __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["isProduction"]) ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["SECURE_COOKIE_PREFIX"] : "";
    const crossSubdomainEnabled = !!options.advanced?.crossSubDomainCookies?.enabled;
    const domain = crossSubdomainEnabled ? options.advanced?.crossSubDomainCookies?.domain || (baseURLString ? new URL(baseURLString).hostname : void 0) : void 0;
    if (crossSubdomainEnabled && !domain && !(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$url$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["isDynamicBaseURLConfig"])(options.baseURL)) throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"]("baseURL is required when crossSubdomainCookies are enabled.");
    function createCookie(cookieName, overrideAttributes = {}) {
        const prefix = options.advanced?.cookiePrefix || "better-auth";
        const name = options.advanced?.cookies?.[cookieName]?.name || `${prefix}.${cookieName}`;
        const attributes = options.advanced?.cookies?.[cookieName]?.attributes ?? {};
        return {
            name: `${secureCookiePrefix}${name}`,
            attributes: {
                secure: !!secureCookiePrefix,
                sameSite: "lax",
                path: "/",
                httpOnly: true,
                ...crossSubdomainEnabled ? {
                    domain
                } : {},
                ...options.advanced?.defaultCookieAttributes,
                ...overrideAttributes,
                ...attributes
            }
        };
    }
    return createCookie;
}
function getCookies(options) {
    const createCookie = createCookieGetter(options);
    const sessionToken = createCookie("session_token", {
        maxAge: options.session?.expiresIn || (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$time$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["sec"])("7d")
    });
    const sessionData = createCookie("session_data", {
        maxAge: options.session?.cookieCache?.maxAge || 300
    });
    const accountData = createCookie("account_data", {
        maxAge: options.session?.cookieCache?.maxAge || 300
    });
    const dontRememberToken = createCookie("dont_remember");
    return {
        sessionToken: {
            name: sessionToken.name,
            attributes: sessionToken.attributes
        },
        /**
		* This cookie is used to store the session data in the cookie
		* This is useful for when you want to cache the session in the cookie
		*/ sessionData: {
            name: sessionData.name,
            attributes: sessionData.attributes
        },
        dontRememberToken: {
            name: dontRememberToken.name,
            attributes: dontRememberToken.attributes
        },
        accountData: {
            name: accountData.name,
            attributes: accountData.attributes
        }
    };
}
async function setCookieCache(ctx, session, dontRememberMe) {
    if (!ctx.context.options.session?.cookieCache?.enabled) return;
    const filteredSession = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$db$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["filterOutputFields"])(session.session, ctx.context.options.session?.additionalFields);
    const filteredUser = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$db$2f$schema$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseUserOutput"])(ctx.context.options, session.user);
    const versionConfig = ctx.context.options.session?.cookieCache?.version;
    let version = "1";
    if (versionConfig) {
        if (typeof versionConfig === "string") version = versionConfig;
        else if (typeof versionConfig === "function") {
            const result = versionConfig(session.session, session.user);
            version = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$is$2d$promise$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["isPromise"])(result) ? await result : result;
        }
    }
    const sessionData = {
        session: filteredSession,
        user: filteredUser,
        updatedAt: Date.now(),
        version
    };
    const options = {
        ...ctx.context.authCookies.sessionData.attributes,
        maxAge: dontRememberMe ? void 0 : ctx.context.authCookies.sessionData.attributes.maxAge
    };
    const expiresAtDate = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$date$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["getDate"])(options.maxAge || 60, "sec").getTime();
    const strategy = ctx.context.options.session?.cookieCache?.strategy || "compact";
    let data;
    if (strategy === "jwe") data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["symmetricEncodeJWT"])(sessionData, ctx.context.secretConfig, "better-auth-session", options.maxAge || 300);
    else if (strategy === "jwt") {
        const cookieCacheSigner = ctx.context.sessionConfig.cookieCacheSigner;
        data = cookieCacheSigner ? await cookieCacheSigner.sign(ctx, sessionData, options.maxAge || 300) : await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["signJWT"])(sessionData, ctx.context.secret, options.maxAge || 300);
    } else data = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$base64$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["base64Url"].encode(JSON.stringify({
        session: sessionData,
        expiresAt: expiresAtDate,
        signature: await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$hmac$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["createHMAC"])("SHA-256", "base64urlnopad").sign(ctx.context.secret, JSON.stringify({
            ...sessionData,
            expiresAt: expiresAtDate
        }))
    }), {
        padding: false
    });
    const sessionStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$session$2d$store$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["createSessionStore"])(ctx.context.authCookies.sessionData.name, options, ctx);
    sessionStore.setCookies(sessionStore.chunk(data, options));
    if (ctx.context.options.account?.storeAccountCookie && !hasPendingSetCookie(ctx, ctx.context.authCookies.accountData.name)) {
        const accountData = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$session$2d$store$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["getAccountCookie"])(ctx);
        if (accountData) if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$context$2f$store$2d$capabilities$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["shouldBindAccountCookieToSessionUser"])(ctx.context.options) || accountData.userId === session.user.id) await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$session$2d$store$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["setAccountCookie"])(ctx, accountData);
        else {
            expireCookie(ctx, ctx.context.authCookies.accountData);
            const accountStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$session$2d$store$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["createAccountStore"])(ctx.context.authCookies.accountData.name, ctx.context.authCookies.accountData.attributes, ctx);
            accountStore.setCookies(accountStore.clean());
        }
    }
}
async function decodeCookieCache(ctx, value) {
    const strategy = ctx.context.options.session?.cookieCache?.strategy || "compact";
    if (strategy === "jwe") {
        const decoded = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["symmetricDecodeJWT"])(value, ctx.context.secretConfig, "better-auth-session");
        const payload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookieCachePayload"])(decoded);
        if (!payload) return null;
        return {
            session: payload,
            expiresAt: decoded?.exp ? decoded.exp * 1e3 : Date.now()
        };
    }
    if (strategy === "jwt") {
        const cookieCacheSigner = ctx.context.sessionConfig.cookieCacheSigner;
        if (cookieCacheSigner) {
            const verified = await cookieCacheSigner.verify(ctx, value);
            if (!verified) return null;
            return {
                session: verified.payload,
                expiresAt: verified.expiresAt
            };
        }
        const decoded = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["verifyJWT"])(value, ctx.context.secret);
        const payload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookieCachePayload"])(decoded);
        if (!payload) return null;
        return {
            session: payload,
            expiresAt: decoded?.exp ? decoded.exp * 1e3 : Date.now()
        };
    }
    const parsed = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCompactCookieCache"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$json$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["safeJSONParse"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$binary$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["binary"].decode(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$base64$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["base64Url"].decode(value))));
    if (!parsed) return null;
    if (!await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$hmac$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["createHMAC"])("SHA-256", "base64urlnopad").verify(ctx.context.secret, JSON.stringify({
        ...parsed.session,
        expiresAt: parsed.expiresAt
    }), parsed.signature)) return null;
    const payload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookieCachePayload"])(parsed.session);
    return payload ? {
        session: payload,
        expiresAt: parsed.expiresAt
    } : null;
}
async function setSessionCookie(ctx, session, dontRememberMe, overrides) {
    const dontRememberMeCookie = await ctx.getSignedCookie(ctx.context.authCookies.dontRememberToken.name, ctx.context.secret);
    dontRememberMe = dontRememberMe !== void 0 ? dontRememberMe : !!dontRememberMeCookie;
    const options = ctx.context.authCookies.sessionToken.attributes;
    const maxAge = dontRememberMe ? void 0 : ctx.context.sessionConfig.expiresIn;
    await ctx.setSignedCookie(ctx.context.authCookies.sessionToken.name, session.session.token, ctx.context.secret, {
        ...options,
        maxAge,
        ...overrides
    });
    if (dontRememberMe) await ctx.setSignedCookie(ctx.context.authCookies.dontRememberToken.name, "true", ctx.context.secret, ctx.context.authCookies.dontRememberToken.attributes);
    await setCookieCache(ctx, session, dontRememberMe);
    ctx.context.setNewSession(session);
}
/**
* Remove any prior `Set-Cookie` entries on the current response whose cookie
* name matches `cookieName` or any chunked variant (`${cookieName}.0`, etc.).
*
* Prevents a valid cookie value from leaking on the wire when the same cookie
* is set and then expired within a single request (e.g. `/sign-in/email`
* writes credential session cookies and the 2FA after-hook expires them).
* Browsers honor the expiring entry, but anything reading the raw response
* headers — proxy/LB logs, server-side SDK consumers, observability tools —
* sees the earlier valid value and could replay it (bypassing the 2FA gate
* when the cookie cache is enabled).
*
* Scrubs both the local middleware scope's `responseHeaders` and the outer
* endpoint scope's `ctx.context.responseHeaders`, because plugin after-hooks
* run in a fresh local scope while accumulated response headers live on the
* outer one. `scoped.context` is required by {@link GenericEndpointContext}
* but unit-test mocks pass a minimal object via `as any`, so we use optional
* chaining defensively. The `Set` collapses the case where both scopes
* reference the same `Headers`.
*/ function removeSetCookieEntries(ctx, cookieName) {
    const scoped = ctx;
    const targets = /* @__PURE__ */ new Set();
    if (scoped.responseHeaders) targets.add(scoped.responseHeaders);
    if (scoped.context?.responseHeaders) targets.add(scoped.context.responseHeaders);
    const exact = `${cookieName}=`;
    const chunk = `${cookieName}.`;
    for (const headers of targets){
        const existing = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["splitSetCookieHeader"])(headers.get("set-cookie") || "");
        if (!existing.length) continue;
        const survivors = existing.filter((entry)=>!entry.startsWith(exact) && !entry.startsWith(chunk));
        if (survivors.length === existing.length) continue;
        headers.delete("set-cookie");
        for (const entry of survivors)headers.append("set-cookie", entry);
    }
}
/**
* Whether the response already has a pending `Set-Cookie` for `cookieName`
* or a chunked variant.
*/ function hasPendingSetCookie(ctx, cookieName) {
    const scoped = ctx;
    const targets = /* @__PURE__ */ new Set();
    if (scoped.responseHeaders) targets.add(scoped.responseHeaders);
    if (scoped.context?.responseHeaders) targets.add(scoped.context.responseHeaders);
    const exact = `${cookieName}=`;
    const chunk = `${cookieName}.`;
    for (const headers of targets)if ((typeof headers.getSetCookie === "function" ? headers.getSetCookie() : (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["splitSetCookieHeader"])(headers.get("set-cookie") || "")).some((entry)=>entry.startsWith(exact) || entry.startsWith(chunk))) return true;
    return false;
}
/**
* Expires a cookie by setting `maxAge: 0` while preserving its attributes
*/ function expireCookie(ctx, cookie) {
    removeSetCookieEntries(ctx, cookie.name);
    ctx.setCookie(cookie.name, "", {
        ...cookie.attributes,
        maxAge: 0
    });
}
function deleteSessionCookie(ctx, skipDontRememberMe) {
    expireCookie(ctx, ctx.context.authCookies.sessionToken);
    expireCookie(ctx, ctx.context.authCookies.sessionData);
    if (ctx.context.options.account?.storeAccountCookie) {
        expireCookie(ctx, ctx.context.authCookies.accountData);
        const accountStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$session$2d$store$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["createAccountStore"])(ctx.context.authCookies.accountData.name, ctx.context.authCookies.accountData.attributes, ctx);
        const cleanCookies = accountStore.clean();
        accountStore.setCookies(cleanCookies);
    }
    if (ctx.context.oauthConfig.storeStateStrategy === "cookie") expireCookie(ctx, ctx.context.createAuthCookie("oauth_state"));
    const sessionStore = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$session$2d$store$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["createSessionStore"])(ctx.context.authCookies.sessionData.name, ctx.context.authCookies.sessionData.attributes, ctx);
    const cleanCookies = sessionStore.clean();
    sessionStore.setCookies(cleanCookies);
    if (!skipDontRememberMe) expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
}
function isEmbeddedSessionExpired(session) {
    if (!session?.expiresAt) return false;
    const expiresAt = new Date(session.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt < Date.now();
}
const getSessionCookie = (request, config)=>{
    const cookies = (request instanceof Headers || !("headers" in request) ? request : request.headers).get("cookie");
    if (!cookies) return null;
    const { cookieName = "session_token", cookiePrefix = "better-auth" } = config || {};
    const parsedCookie = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookies"])(cookies);
    const getCookie = (name)=>parsedCookie.get(`__Secure-${name}`) ?? parsedCookie.get(name);
    const sessionToken = getCookie(`${cookiePrefix}.${cookieName}`) || getCookie(`${cookiePrefix}-${cookieName}`);
    if (sessionToken) return sessionToken;
    return null;
};
async function matchesVersion(payload, version) {
    const expectedVersion = typeof version === "string" ? version : await version(payload.session, payload.user);
    return (payload.version || "1") === expectedVersion;
}
const getCookieCache = async (request, config)=>{
    const cookies = (request instanceof Headers || !("headers" in request) ? request : request.headers).get("cookie");
    if (!cookies) return null;
    const { cookieName = "session_data", cookiePrefix = "better-auth" } = config || {};
    const name = config?.isSecure !== void 0 ? config.isSecure ? `${__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["SECURE_COOKIE_PREFIX"]}${cookiePrefix}.${cookieName}` : `${cookiePrefix}.${cookieName}` : __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["isProduction"] ? `${__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["SECURE_COOKIE_PREFIX"]}${cookiePrefix}.${cookieName}` : `${cookiePrefix}.${cookieName}`;
    const parsedCookie = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookies"])(cookies);
    let sessionData = parsedCookie.get(name);
    if (!sessionData) {
        const chunks = [];
        for (const [cookieName, value] of parsedCookie.entries())if (cookieName.startsWith(name + ".")) {
            const parts = cookieName.split(".");
            const indexStr = parts[parts.length - 1];
            const index = parseInt(indexStr || "0", 10);
            if (!isNaN(index)) chunks.push({
                index,
                value
            });
        }
        if (chunks.length > 0) {
            chunks.sort((a, b)=>a.index - b.index);
            sessionData = chunks.map((c)=>c.value).join("");
        }
    }
    if (sessionData) {
        const strategy = config?.strategy || "compact";
        if (strategy === "jwe") {
            const secret = config?.secret || __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].BETTER_AUTH_SECRET;
            if (!secret) throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"]("getCookieCache requires a secret to be provided. Either pass it as an option or set the BETTER_AUTH_SECRET environment variable");
            const payload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookieCachePayload"])(await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["symmetricDecodeJWT"])(sessionData, secret, "better-auth-session"));
            if (!payload) return null;
            if (config?.version) {
                if (!await matchesVersion(payload, config.version)) return null;
            }
            if (isEmbeddedSessionExpired(payload.session)) return null;
            return payload;
        } else if (strategy === "jwt") {
            const jwks = config?.jwt?.jwks;
            let payload;
            if (jwks) payload = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["verifySessionCookieJwtWithJwks"])(sessionData, jwks, {
                issuer: config?.jwt?.issuer,
                audience: config?.jwt?.audience
            });
            else {
                const secret = config?.secret || __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].BETTER_AUTH_SECRET;
                if (!secret) throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"]("getCookieCache requires a secret to be provided. Either pass it as an option or set the BETTER_AUTH_SECRET environment variable");
                payload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookieCachePayload"])(await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["verifyJWT"])(sessionData, secret));
            }
            if (!payload) return null;
            if (config?.version) {
                if (!await matchesVersion(payload, config.version)) return null;
            }
            if (isEmbeddedSessionExpired(payload.session)) return null;
            return payload;
        } else {
            const secret = config?.secret || __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].BETTER_AUTH_SECRET;
            if (!secret) throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"]("getCookieCache requires a secret to be provided. Either pass it as an option or set the BETTER_AUTH_SECRET environment variable");
            const sessionDataPayload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCompactCookieCache"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$json$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["safeJSONParse"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$binary$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["binary"].decode(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$base64$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["base64Url"].decode(sessionData))));
            if (!sessionDataPayload) return null;
            if (!await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$utils$40$0$2e$4$2e$2$2f$node_modules$2f40$better$2d$auth$2f$utils$2f$dist$2f$hmac$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["createHMAC"])("SHA-256", "base64urlnopad").verify(secret, JSON.stringify({
                ...sessionDataPayload.session,
                expiresAt: sessionDataPayload.expiresAt
            }), sessionDataPayload.signature)) return null;
            const payload = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookieCachePayload"])(sessionDataPayload.session);
            if (!payload) return null;
            if (config?.version) {
                if (!await matchesVersion(payload, config.version)) return null;
            }
            if (typeof sessionDataPayload.expiresAt === "number" && sessionDataPayload.expiresAt < Date.now()) return null;
            if (isEmbeddedSessionExpired(payload.session)) return null;
            return payload;
        }
    }
    return null;
};
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/jwt.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SESSION_COOKIE_JWT_AUDIENCE",
    ()=>SESSION_COOKIE_JWT_AUDIENCE,
    "SESSION_COOKIE_JWT_ISSUER",
    ()=>SESSION_COOKIE_JWT_ISSUER,
    "SESSION_COOKIE_JWT_TYPE",
    ()=>SESSION_COOKIE_JWT_TYPE,
    "getSessionCookieJwtVerifyOptions",
    ()=>getSessionCookieJwtVerifyOptions,
    "parseSessionCookieJwtPayload",
    ()=>parseSessionCookieJwtPayload,
    "verifySessionCookieJwtWithJwks",
    ()=>verifySessionCookieJwtWithJwks
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/cache.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$util$2f$decode_protected_header$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/util/decode_protected_header.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$key$2f$import$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/key/import.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$verify$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/jwt/verify.js [middleware] (ecmascript)");
;
;
//#region src/cookies/jwt.ts
const SESSION_COOKIE_JWT_TYPE = "better-auth.session-cache+jwt";
const SESSION_COOKIE_JWT_AUDIENCE = "better-auth:session-cache";
const SESSION_COOKIE_JWT_ISSUER = "better-auth:session-cache";
function getSessionCookieJwtVerifyOptions(options) {
    const verifyOptions = {
        clockTolerance: 15,
        audience: options?.audience ?? "better-auth:session-cache"
    };
    if (options?.issuer) verifyOptions.issuer = options.issuer;
    return verifyOptions;
}
function parseSessionCookieJwtPayload(payload) {
    const data = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cache$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookieCachePayload"])(payload);
    if (!data || typeof payload.iss !== "string" || !payload.iss) return null;
    if (payload.sub !== data.user.id || payload.sid !== data.session.token) return null;
    return {
        ...payload,
        ...data
    };
}
async function verifySessionCookieJwtWithJwks(token, jwks, options) {
    try {
        const header = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$util$2f$decode_protected_header$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["decodeProtectedHeader"])(token);
        if (header.typ !== "better-auth.session-cache+jwt") return null;
        const kid = header.kid;
        if (!kid) return null;
        const key = jwks.keys.find((entry)=>entry.kid === kid);
        if (!key) return null;
        const alg = key.alg ?? header.alg;
        if (!alg) return null;
        const { payload } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$verify$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jwtVerify"])(token, await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$key$2f$import$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["importJWK"])(key, alg), {
            ...getSessionCookieJwtVerifyOptions(options),
            algorithms: [
                alg
            ]
        });
        return parseSessionCookieJwtPayload(payload);
    } catch  {
        return null;
    }
}
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/session-store.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createAccountStore",
    ()=>createAccountStore,
    "createSessionStore",
    ()=>createSessionStore,
    "getAccountCookie",
    ()=>getAccountCookie,
    "getChunkedCookie",
    ()=>getChunkedCookie,
    "getSessionQuerySchema",
    ()=>getSessionQuerySchema,
    "setAccountCookie",
    ()=>setAccountCookie
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/crypto/jwt.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/cookies/cookie-utils.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$json$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/utils/json.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$call$40$1$2e$4$2e$0$2b$fff7ddf946fac095$2f$node_modules$2f$better$2d$call$2f$dist$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-call@1.4.0+fff7ddf946fac095/node_modules/better-call/dist/index.mjs [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$call$40$1$2e$4$2e$0$2b$fff7ddf946fac095$2f$node_modules$2f$better$2d$call$2f$dist$2f$cookies$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-call@1.4.0+fff7ddf946fac095/node_modules/better-call/dist/cookies.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/schemas.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$coerce$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__coerce$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/zod@4.6.5/node_modules/zod/v4/classic/coerce.js [middleware] (ecmascript) <export * as coerce>");
;
;
;
;
;
//#region src/cookies/session-store.ts
/**
* Per-cookie byte ceiling.
* Safari's ~4093 floor is the lowest among browsers.
* Kept a little under it for attributes added after sizing.
*
* @see https://datatracker.ietf.org/doc/html/rfc6265#section-6.1
* @see https://github.com/dotnet/aspnetcore/blob/aa5493528640932601bb82ef3295e4d8ca7e11c5/src/Shared/ChunkingCookieManager/ChunkingCookieManager.cs#L40
*/ const MAX_COOKIE_SIZE = 4050;
/**
* Max chunks per cookie.
* A larger value does not belong in a cookie.
*/ const MAX_COOKIE_CHUNKS = 100;
/**
* Largest value that keeps the serialized cookie within {@link MAX_COOKIE_SIZE},
* measured with the real `serializeCookie` writer so it stays in sync with the
* wire. Non-positive when the name and attributes alone overflow.
*/ function getMaxCookieValueSize(name, options) {
    return MAX_COOKIE_SIZE - (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$call$40$1$2e$4$2e$0$2b$fff7ddf946fac095$2f$node_modules$2f$better$2d$call$2f$dist$2f$cookies$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["serializeCookie"])(name, "", {
        ...options
    }).length;
}
function parseCookieChunkIndex(cookieName, name) {
    const prefix = `${cookieName}.`;
    if (!name.startsWith(prefix)) return null;
    const suffix = name.slice(prefix.length);
    const index = Number(suffix);
    if (!Number.isSafeInteger(index) || index < 0 || String(index) !== suffix) return null;
    return index;
}
/**
* Read all existing chunks from cookies
*/ function readExistingChunks(cookieName, ctx) {
    const chunks = {};
    const cookies = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookies"])(ctx.headers?.get("cookie") || "");
    for (const [name, value] of cookies){
        if (name !== cookieName && parseCookieChunkIndex(cookieName, name) === null) continue;
        chunks[name] = value;
    }
    return chunks;
}
/**
* Split a cookie value into chunks if needed
*/ function chunkCookie(storeName, cookie, chunks, logger) {
    const chunkSize = getMaxCookieValueSize(`${cookie.name}.${MAX_COOKIE_CHUNKS - 1}`, cookie.attributes);
    const chunkCount = chunkSize > 0 ? Math.ceil(cookie.value.length / chunkSize) : Infinity;
    if (chunkCount <= 1) {
        chunks[cookie.name] = cookie.value;
        return [
            cookie
        ];
    }
    if (chunkCount > MAX_COOKIE_CHUNKS) {
        logger.warn(`${storeName} cookie is too large to store even after chunking, so the cookie cache was skipped. Reduce the cached data size or avoid storing this data in cookies.`);
        return [];
    }
    const cookies = [];
    for(let i = 0; i < chunkCount; i++){
        const name = `${cookie.name}.${i}`;
        const start = i * chunkSize;
        const value = cookie.value.substring(start, start + chunkSize);
        cookies.push({
            ...cookie,
            name,
            value
        });
        chunks[name] = value;
    }
    logger.debug(`CHUNKING_${storeName.toUpperCase()}_COOKIE`, {
        message: `${storeName} cookie exceeds the ${MAX_COOKIE_SIZE} byte limit and was split into ${chunkCount} chunks.`,
        valueSize: cookie.value.length,
        chunkCount,
        chunkSizes: cookies.map((c)=>c.value.length)
    });
    return cookies;
}
/**
* Get all cookies that should be cleaned (removed)
*/ function getCleanCookies(chunks, cookieOptions) {
    const cleanedChunks = {};
    for(const name in chunks)cleanedChunks[name] = {
        name,
        value: "",
        attributes: {
            ...cookieOptions,
            maxAge: 0
        }
    };
    return cleanedChunks;
}
/**
* Store that splits a cookie into numbered chunks when its serialized form
* would exceed the per-cookie byte limit, expiring stale chunks as needed.
*
* @see https://github.com/nextauthjs/next-auth/blob/27b2519b84b8eb9cf053775dea29d577d2aa0098/packages/next-auth/src/core/lib/cookie.ts
*/ const storeFactory = (storeName)=>(cookieName, cookieOptions, ctx)=>{
        const chunks = readExistingChunks(cookieName, ctx);
        const logger = ctx.context.logger;
        const expireExistingChunks = ()=>{
            const expired = getCleanCookies(chunks, cookieOptions);
            for(const name in chunks)delete chunks[name];
            return expired;
        };
        return {
            chunk (value, options) {
                const cookies = expireExistingChunks();
                const chunked = chunkCookie(storeName, {
                    name: cookieName,
                    value,
                    attributes: {
                        ...cookieOptions,
                        ...options
                    }
                }, chunks, logger);
                for (const chunk of chunked)cookies[chunk.name] = chunk;
                return Object.values(cookies);
            },
            clean () {
                return Object.values(expireExistingChunks());
            },
            setCookies (cookies) {
                for (const cookie of cookies)ctx.setCookie(cookie.name, cookie.value, cookie.attributes);
            }
        };
    };
const createSessionStore = storeFactory("Session");
const createAccountStore = storeFactory("Account");
function getChunkedCookie(ctx, cookieName) {
    const value = ctx.getCookie(cookieName);
    if (value) return value;
    const chunks = [];
    const cookieHeader = ctx.headers?.get("cookie");
    if (!cookieHeader) return null;
    for (const [name, val] of (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$cookies$2f$cookie$2d$utils$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["parseCookies"])(cookieHeader)){
        const index = parseCookieChunkIndex(cookieName, name);
        if (index === null) continue;
        chunks.push({
            index,
            value: val
        });
    }
    if (chunks.length > 0) {
        chunks.sort((a, b)=>a.index - b.index);
        return chunks.map((c)=>c.value).join("");
    }
    return null;
}
async function setAccountCookie(c, accountData) {
    const accountDataCookie = c.context.authCookies.accountData;
    const options = {
        maxAge: 300,
        ...accountDataCookie.attributes
    };
    const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["symmetricEncodeJWT"])(accountData, c.context.secretConfig, "better-auth-account", options.maxAge);
    const accountStore = createAccountStore(accountDataCookie.name, options, c);
    accountStore.setCookies(accountStore.chunk(data, options));
}
async function getAccountCookie(c) {
    const accountCookie = getChunkedCookie(c, c.context.authCookies.accountData.name);
    if (accountCookie) {
        const accountData = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$json$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["safeJSONParse"])(await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$crypto$2f$jwt$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["symmetricDecodeJWT"])(accountCookie, c.context.secretConfig, "better-auth-account"));
        if (accountData) return accountData;
    }
    return null;
}
const getSessionQuerySchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["optional"](__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$schemas$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["object"]({
    /**
	* If cookie cache is enabled, it will disable the cache
	* and fetch the session from the database
	*/ disableCookieCache: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$coerce$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__coerce$3e$__["coerce"].boolean().meta({
        description: "Disable cookie cache and fetch session from database"
    }).optional(),
    disableRefresh: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$zod$40$4$2e$6$2e$5$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$coerce$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__coerce$3e$__["coerce"].boolean().meta({
        description: "Disable session refresh. Useful for checking session status, without updating the session"
    }).optional()
}));
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/crypto/jwt.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "signJWT",
    ()=>signJWT,
    "symmetricDecodeJWT",
    ()=>symmetricDecodeJWT,
    "symmetricEncodeJWT",
    ()=>symmetricEncodeJWT,
    "verifyJWT",
    ()=>verifyJWT
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$noble$2b$hashes$40$2$2e$4$2e$0$2f$node_modules$2f40$noble$2f$hashes$2f$hkdf$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@noble+hashes@2.4.0/node_modules/@noble/hashes/hkdf.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$noble$2b$hashes$40$2$2e$4$2e$0$2f$node_modules$2f40$noble$2f$hashes$2f$sha2$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@noble+hashes@2.4.0/node_modules/@noble/hashes/sha2.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$encrypt$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/jwt/encrypt.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$sign$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/jwt/sign.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$util$2f$base64url$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__base64url__$2e$encode$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/util/base64url.js [middleware] (ecmascript) <export * as base64url .encode>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwk$2f$thumbprint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/jwk/thumbprint.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$util$2f$decode_protected_header$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/util/decode_protected_header.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$decrypt$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/jwt/decrypt.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$verify$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/jwt/verify.js [middleware] (ecmascript)");
;
;
;
//#region src/crypto/jwt.ts
async function signJWT(payload, secret, expiresIn = 3600) {
    return await new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$sign$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["SignJWT"](payload).setProtectedHeader({
        alg: "HS256"
    }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1e3) + expiresIn).sign(new TextEncoder().encode(secret));
}
async function verifyJWT(token, secret) {
    try {
        return (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$verify$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jwtVerify"])(token, new TextEncoder().encode(secret))).payload;
    } catch  {
        return null;
    }
}
const info = new Uint8Array([
    66,
    101,
    116,
    116,
    101,
    114,
    65,
    117,
    116,
    104,
    46,
    106,
    115,
    32,
    71,
    101,
    110,
    101,
    114,
    97,
    116,
    101,
    100,
    32,
    69,
    110,
    99,
    114,
    121,
    112,
    116,
    105,
    111,
    110,
    32,
    75,
    101,
    121
]);
const now = ()=>Date.now() / 1e3 | 0;
const alg = "dir";
const enc = "A256CBC-HS512";
function deriveEncryptionSecret(secret, salt) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$noble$2b$hashes$40$2$2e$4$2e$0$2f$node_modules$2f40$noble$2f$hashes$2f$hkdf$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["hkdf"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$noble$2b$hashes$40$2$2e$4$2e$0$2f$node_modules$2f40$noble$2f$hashes$2f$sha2$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["sha256"], new TextEncoder().encode(secret), new TextEncoder().encode(salt), info, 64);
}
function getCurrentSecret(secret) {
    if (typeof secret === "string") return secret;
    const value = secret.keys.get(secret.currentVersion);
    if (!value) throw new Error(`Secret version ${secret.currentVersion} not found in keys`);
    return value;
}
function getAllSecrets(secret) {
    if (typeof secret === "string") return [
        {
            version: 0,
            value: secret
        }
    ];
    const result = [];
    for (const [version, value] of secret.keys)result.push({
        version,
        value
    });
    if (secret.legacySecret && !result.some((s)=>s.value === secret.legacySecret)) result.push({
        version: -1,
        value: secret.legacySecret
    });
    return result;
}
async function symmetricEncodeJWT(payload, secret, salt, expiresIn = 3600) {
    const encryptionSecret = deriveEncryptionSecret(getCurrentSecret(secret), salt);
    const thumbprint = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwk$2f$thumbprint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["calculateJwkThumbprint"])({
        kty: "oct",
        k: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$util$2f$base64url$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__base64url__$2e$encode$3e$__["base64url"].encode(encryptionSecret)
    }, "sha256");
    return await new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$encrypt$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["EncryptJWT"](payload).setProtectedHeader({
        alg,
        enc,
        kid: thumbprint
    }).setIssuedAt().setExpirationTime(now() + expiresIn).setJti(crypto.randomUUID()).encrypt(encryptionSecret);
}
const jwtDecryptOpts = {
    clockTolerance: 15,
    keyManagementAlgorithms: [
        alg
    ],
    contentEncryptionAlgorithms: [
        enc,
        "A256GCM"
    ]
};
async function symmetricDecodeJWT(token, secret, salt) {
    if (!token) return null;
    let hasKid = false;
    try {
        hasKid = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$util$2f$decode_protected_header$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["decodeProtectedHeader"])(token).kid !== void 0;
    } catch  {
        return null;
    }
    try {
        const secrets = getAllSecrets(secret);
        const { payload } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$decrypt$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jwtDecrypt"])(token, async (protectedHeader)=>{
            const kid = protectedHeader.kid;
            if (kid !== void 0) {
                for (const s of secrets){
                    const encryptionSecret = deriveEncryptionSecret(s.value, salt);
                    if (kid === await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwk$2f$thumbprint$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["calculateJwkThumbprint"])({
                        kty: "oct",
                        k: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$util$2f$base64url$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__base64url__$2e$encode$3e$__["base64url"].encode(encryptionSecret)
                    }, "sha256")) return encryptionSecret;
                }
                throw new Error("no matching decryption secret");
            }
            if (secrets.length === 1) return deriveEncryptionSecret(secrets[0].value, salt);
            return deriveEncryptionSecret(secrets[0].value, salt);
        }, jwtDecryptOpts);
        return payload;
    } catch  {
        if (hasKid) return null;
        const secrets = getAllSecrets(secret);
        if (secrets.length <= 1) return null;
        for(let i = 1; i < secrets.length; i++)try {
            const s = secrets[i];
            const { payload } = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$jose$40$6$2e$2$2e$12$2f$node_modules$2f$jose$2f$dist$2f$webapi$2f$jwt$2f$decrypt$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["jwtDecrypt"])(token, deriveEncryptionSecret(s.value, salt), jwtDecryptOpts);
            return payload;
        } catch  {
            continue;
        }
        return null;
    }
}
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/db/schema.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "buildSyntheticUserOutput",
    ()=>buildSyntheticUserOutput,
    "getSessionDefaultFields",
    ()=>getSessionDefaultFields,
    "mergeSchema",
    ()=>mergeSchema,
    "parseAccountInput",
    ()=>parseAccountInput,
    "parseAccountOutput",
    ()=>parseAccountOutput,
    "parseAdditionalUserInput",
    ()=>parseAdditionalUserInput,
    "parseAdditionalUserInputFromProviderProfile",
    ()=>parseAdditionalUserInputFromProviderProfile,
    "parseInputData",
    ()=>parseInputData,
    "parseSessionInput",
    ()=>parseSessionInput,
    "parseSessionOutput",
    ()=>parseSessionOutput,
    "parseUserInput",
    ()=>parseUserInput,
    "parseUserOutput",
    ()=>parseUserOutput
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$db$2f$get$2d$tables$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/db/get-tables.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/error/index.mjs [middleware] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$codes$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/error/codes.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$db$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/utils/db.mjs [middleware] (ecmascript)");
;
;
;
//#region src/db/schema.ts
const cache = /* @__PURE__ */ new WeakMap();
function getFields(options, modelName, mode) {
    const cacheKey = `${modelName}:${mode}`;
    if (!cache.has(options)) cache.set(options, /* @__PURE__ */ new Map());
    const tableCache = cache.get(options);
    if (tableCache.has(cacheKey)) return tableCache.get(cacheKey);
    const coreSchema = mode === "output" ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$db$2f$get$2d$tables$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["getAuthTables"])(options)[modelName]?.fields ?? {} : {};
    const additionalFields = modelName === "user" || modelName === "session" || modelName === "account" ? options[modelName]?.additionalFields : void 0;
    let schema = {
        ...coreSchema,
        ...additionalFields ?? {}
    };
    for (const plugin of options.plugins || [])if (plugin.schema && plugin.schema[modelName]) schema = {
        ...schema,
        ...plugin.schema[modelName].fields
    };
    tableCache.set(cacheKey, schema);
    return schema;
}
function parseUserOutput(options, user) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$db$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["filterOutputFields"])(user, getFields(options, "user", "output"));
}
/**
* Builds a synthetic user object that matches the shape of a real user
* returned from the database. This ensures enumeration protection works
* correctly by making synthetic and real user responses indistinguishable.
*
* The function iterates over the user output schema and:
* - Includes all fields that should be returned (returned !== false)
* - Uses provided values when available
* - Sets optional fields to null when no value is provided
* - Applies default values where defined
* - Always includes the 'id' field (not part of schema but always present)
*/ function buildSyntheticUserOutput(options, data) {
    const schema = getFields(options, "user", "output");
    const result = {};
    for(const key in schema){
        const fieldAttr = schema[key];
        if (fieldAttr.returned === false) continue;
        if (key in data && data[key] !== void 0) result[key] = data[key];
        else if (fieldAttr.defaultValue !== void 0) result[key] = typeof fieldAttr.defaultValue === "function" ? fieldAttr.defaultValue() : fieldAttr.defaultValue;
        else if (!fieldAttr.required) result[key] = null;
    }
    if ("id" in data) result.id = data.id;
    return result;
}
function parseSessionOutput(options, session) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$db$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["filterOutputFields"])(session, getFields(options, "session", "output"));
}
function parseAccountOutput(options, account) {
    const { accessToken: _accessToken, refreshToken: _refreshToken, idToken: _idToken, accessTokenExpiresAt: _accessTokenExpiresAt, refreshTokenExpiresAt: _refreshTokenExpiresAt, password: _password, ...rest } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$utils$2f$db$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["filterOutputFields"])(account, getFields(options, "account", "output"));
    return rest;
}
function parseInputData(data, schema) {
    const action = schema.action || "create";
    const fields = schema.fields;
    const parsedData = Object.create(null);
    for(const key in fields){
        if (key in data) {
            if (fields[key].input === false) {
                if (fields[key].defaultValue !== void 0) {
                    if (action !== "update") {
                        parsedData[key] = fields[key].defaultValue;
                        continue;
                    }
                }
                if (data[key]) throw __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["APIError"].from("BAD_REQUEST", {
                    ...__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$codes$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["BASE_ERROR_CODES"].FIELD_NOT_ALLOWED,
                    message: `${key} is not allowed to be set`
                });
                continue;
            }
            if (fields[key].validator?.input && data[key] !== void 0) {
                const result = fields[key].validator.input["~standard"].validate(data[key]);
                if (result instanceof Promise) throw __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["APIError"].from("INTERNAL_SERVER_ERROR", __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$codes$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["BASE_ERROR_CODES"].ASYNC_VALIDATION_NOT_SUPPORTED);
                if ("issues" in result && result.issues) throw __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["APIError"].from("BAD_REQUEST", {
                    ...__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$codes$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["BASE_ERROR_CODES"].VALIDATION_ERROR,
                    message: result.issues[0]?.message || "Validation Error"
                });
                parsedData[key] = result.value;
                continue;
            }
            if (fields[key].transform?.input && data[key] !== void 0) {
                parsedData[key] = fields[key].transform?.input(data[key]);
                continue;
            }
            parsedData[key] = data[key];
            continue;
        }
        if (fields[key].defaultValue !== void 0 && action === "create") {
            if (typeof fields[key].defaultValue === "function") {
                parsedData[key] = fields[key].defaultValue();
                continue;
            }
            parsedData[key] = fields[key].defaultValue;
            continue;
        }
        if (fields[key].required && action === "create") throw __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["APIError"].from("BAD_REQUEST", {
            ...__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$codes$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["BASE_ERROR_CODES"].MISSING_FIELD,
            message: `${key} is required`
        });
    }
    return parsedData;
}
function parseUserInput(options, user = {}, action) {
    return parseInputData(user, {
        fields: getFields(options, "user", "input"),
        action
    });
}
function parseAdditionalUserInputFromProviderProfile(options, profile = {}, action) {
    const schema = getFields(options, "user", "input");
    const allowedProfileFields = Object.create(null);
    for (const key of Object.keys(profile)){
        if (schema[key]?.input === false) continue;
        allowedProfileFields[key] = profile[key];
    }
    return parseInputData(allowedProfileFields, {
        fields: schema,
        action
    });
}
function parseAdditionalUserInput(options, user) {
    const schema = getFields(options, "user", "input");
    return parseInputData(user || {}, {
        fields: schema
    });
}
function parseAccountInput(options, account) {
    return parseInputData(account, {
        fields: getFields(options, "account", "input")
    });
}
function parseSessionInput(options, session, action) {
    return parseInputData(session, {
        fields: getFields(options, "session", "input"),
        action
    });
}
function getSessionDefaultFields(options) {
    const fields = getFields(options, "session", "input");
    const defaults = {};
    for(const key in fields)if (fields[key].defaultValue !== void 0) defaults[key] = typeof fields[key].defaultValue === "function" ? fields[key].defaultValue() : fields[key].defaultValue;
    return defaults;
}
function mergeSchema(schema, newSchema) {
    if (!newSchema) return schema;
    for(const table in newSchema){
        const newModelName = newSchema[table]?.modelName;
        if (newModelName) schema[table].modelName = newModelName;
        for(const field in schema[table].fields){
            const newField = newSchema[table]?.fields?.[field];
            if (!newField) continue;
            schema[table].fields[field].fieldName = newField;
        }
    }
    return schema;
}
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/date.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getDate",
    ()=>getDate
]);
//#region src/utils/date.ts
const getDate = (span, unit = "ms")=>{
    return new Date(Date.now() + (unit === "sec" ? span * 1e3 : span));
};
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/is-promise.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "isPromise",
    ()=>isPromise
]);
//#region src/utils/is-promise.ts
function isPromise(obj) {
    return !!obj && (typeof obj === "object" || typeof obj === "function") && typeof obj.then === "function";
}
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/time.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ms",
    ()=>ms,
    "sec",
    ()=>sec
]);
//#region src/utils/time.ts
const SEC = 1e3;
const MIN = SEC * 60;
const HOUR = MIN * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;
const MONTH = DAY * 30;
const YEAR = DAY * 365.25;
const REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mo|years?|yrs?|y)(?: (ago|from now))?$/i;
function parse(value) {
    const match = REGEX.exec(value);
    if (!match || match[4] && match[1]) throw new TypeError(`Invalid time string format: "${value}". Use formats like "7d", "30m", "1 hour", etc.`);
    const n = parseFloat(match[2]);
    const unit = match[3].toLowerCase();
    let result;
    switch(unit){
        case "years":
        case "year":
        case "yrs":
        case "yr":
        case "y":
            result = n * YEAR;
            break;
        case "months":
        case "month":
        case "mo":
            result = n * MONTH;
            break;
        case "weeks":
        case "week":
        case "w":
            result = n * WEEK;
            break;
        case "days":
        case "day":
        case "d":
            result = n * DAY;
            break;
        case "hours":
        case "hour":
        case "hrs":
        case "hr":
        case "h":
            result = n * HOUR;
            break;
        case "minutes":
        case "minute":
        case "mins":
        case "min":
        case "m":
            result = n * MIN;
            break;
        case "seconds":
        case "second":
        case "secs":
        case "sec":
        case "s":
            result = n * SEC;
            break;
        default:
            throw new TypeError(`Unknown time unit: "${unit}"`);
    }
    if (match[1] === "-" || match[4] === "ago") return -result;
    return result;
}
/**
* Parse a time string and return the value in milliseconds.
*
* @param value - A time string like "7d", "30m", "1 hour", "2 hours ago"
* @returns The parsed value in milliseconds
* @throws TypeError if the string format is invalid
*
* @example
* ms("1d")          // 86400000
* ms("2 hours")     // 7200000
* ms("30s")         // 30000
* ms("2 hours ago") // -7200000
*/ function ms(value) {
    return parse(value);
}
/**
* Parse a time string and return the value in seconds.
*
* @param value - A time string like "7d", "30m", "1 hour", "2 hours ago"
* @returns The parsed value in seconds (rounded)
* @throws TypeError if the string format is invalid
*
* @example
* sec("1d")          // 86400
* sec("2 hours")     // 7200
* sec("-30s")        // -30
* sec("2 hours ago") // -7200
*/ function sec(value) {
    return Math.round(parse(value) / 1e3);
}
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/url.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getBaseURL",
    ()=>getBaseURL,
    "getHost",
    ()=>getHost,
    "getHostFromSource",
    ()=>getHostFromSource,
    "getOrigin",
    ()=>getOrigin,
    "getProtocol",
    ()=>getProtocol,
    "getProtocolFromSource",
    ()=>getProtocolFromSource,
    "isDynamicBaseURLConfig",
    ()=>isDynamicBaseURLConfig,
    "isRequestLike",
    ()=>isRequestLike,
    "matchesHostPattern",
    ()=>matchesHostPattern,
    "resolveBaseURL",
    ()=>resolveBaseURL,
    "resolveDynamicBaseURL",
    ()=>resolveDynamicBaseURL,
    "trimTrailingSlashes",
    ()=>trimTrailingSlashes
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$wildcard$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/wildcard.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/env/env-impl.mjs [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.bun/@better-auth+core@1.7.6+d17658d11a503265/node_modules/@better-auth/core/dist/error/index.mjs [middleware] (ecmascript) <locals>");
;
;
;
//#region src/utils/url.ts
const SLASH_CHAR_CODE = "/".charCodeAt(0);
/**
* Minimal loopback check for dev scheme inference only. Reachable from
* `client/config.ts` via `getBaseURL`, so we MUST NOT import the full
* `@better-auth/core/utils/host` classifier here: its `utils/ip` dependency
* on zod would leak into the client bundle (see `e2e/smoke/test/vite.spec.ts`).
*
* Server-side SSRF/loopback checks (oauth redirect matching, trusted-origin
* resolution, electron fetch gate) continue to use the authoritative
* `isLoopbackHost` from `@better-auth/core/utils/host`. This helper's only
* job is picking `http` vs `https` for dev ergonomics.
*/ function isLoopbackForDevScheme(host) {
    const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" || hostname.startsWith("127.");
}
function trimTrailingSlashes(value) {
    let end = value.length;
    while(end > 0 && value.charCodeAt(end - 1) === SLASH_CHAR_CODE)end--;
    return end === value.length ? value : value.slice(0, end);
}
function checkHasPath(url) {
    try {
        return (trimTrailingSlashes(new URL(url).pathname) || "/") !== "/";
    } catch  {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"](`Invalid base URL: ${url}. Please provide a valid base URL.`);
    }
}
function assertHasProtocol(url) {
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"](`Invalid base URL: ${url}. URL must include 'http://' or 'https://'`);
    } catch (error) {
        if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"]) throw error;
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"](`Invalid base URL: ${url}. Please provide a valid base URL.`, {
            cause: error
        });
    }
}
function withPath(url, path = "/api/auth") {
    assertHasProtocol(url);
    if (checkHasPath(url)) return url;
    const trimmedUrl = trimTrailingSlashes(url);
    if (!path || path === "/") return trimmedUrl;
    path = path.startsWith("/") ? path : `/${path}`;
    return `${trimmedUrl}${path}`;
}
function validateProxyHeader(header, type) {
    if (!header || header.trim() === "") return false;
    if (type === "proto") return header === "http" || header === "https";
    if (type === "host") {
        if ([
            /\.\./,
            /\0/,
            /[\s]/,
            /^[.]/,
            /[<>'"]/,
            /javascript:/i,
            /file:/i,
            /data:/i
        ].some((pattern)=>pattern.test(header))) return false;
        return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(:[0-9]{1,5})?$/.test(header) || /^(\d{1,3}\.){3}\d{1,3}(:[0-9]{1,5})?$/.test(header) || /^\[[0-9a-fA-F:]+\](:[0-9]{1,5})?$/.test(header) || /^localhost(:[0-9]{1,5})?$/i.test(header);
    }
    return false;
}
function getBaseURL(url, path, request, loadEnv, trustedProxyHeaders) {
    if (url) return withPath(url, path);
    if (loadEnv !== false) {
        const fromEnv = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].BETTER_AUTH_URL || __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].NEXT_PUBLIC_BETTER_AUTH_URL || __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].PUBLIC_BETTER_AUTH_URL || __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].NUXT_PUBLIC_BETTER_AUTH_URL || __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].NUXT_PUBLIC_AUTH_URL || (__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].BASE_URL !== "/" ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$env$2f$env$2d$impl$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["env"].BASE_URL : void 0);
        if (fromEnv) return withPath(fromEnv, path);
    }
    const fromRequest = request?.headers.get("x-forwarded-host");
    const fromRequestProto = request?.headers.get("x-forwarded-proto");
    if (fromRequest && fromRequestProto && trustedProxyHeaders) {
        if (validateProxyHeader(fromRequestProto, "proto") && validateProxyHeader(fromRequest, "host")) try {
            return withPath(`${fromRequestProto}://${fromRequest}`, path);
        } catch (_error) {}
    }
    if (request) {
        const url = getOrigin(request.url);
        if (!url) throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"]("Could not get origin from request. Please provide a valid base URL.");
        return withPath(url, path);
    }
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
}
function getOrigin(url) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.origin === "null" ? null : parsedUrl.origin;
    } catch  {
        return null;
    }
}
function getProtocol(url) {
    try {
        return new URL(url).protocol;
    } catch  {
        return null;
    }
}
function getHost(url) {
    try {
        return new URL(url).host;
    } catch  {
        return null;
    }
}
/**
* Checks if the baseURL config is a dynamic config object
*/ function isDynamicBaseURLConfig(config) {
    return typeof config === "object" && config !== null && "allowedHosts" in config && Array.isArray(config.allowedHosts);
}
/**
* Check if a value is a `Request`
* - `instanceof`: works for native Request instances
* - `toString`: handles where instanceof check fails but the object is still a
*   valid Request (e.g. cross-realm, polyfills). Paired with a shape check so
*   an object that only spoofs `Symbol.toStringTag` without the real shape is
*   rejected before downstream code tries to read `.headers` / `.url`.
*
* @param value The value to check
* @returns `true` if the value is a Request instance
*/ function isRequestLike(value) {
    if (value instanceof Request) return true;
    if (typeof value !== "object" || value === null || Object.prototype.toString.call(value) !== "[object Request]") return false;
    const v = value;
    return typeof v.url === "string" && typeof v.headers === "object" && v.headers !== null && typeof v.headers.get === "function";
}
/**
* Extracts the host from a `Request` or `Headers`.
* Honors `x-forwarded-host` only when `trustedProxyHeaders` is enabled,
* then falls back to the `host` header and finally the request URL.
*/ function getHostFromSource(source, trustedProxyHeaders) {
    const headers = isRequestLike(source) ? source.headers : source;
    if (trustedProxyHeaders) {
        const forwardedHost = headers.get("x-forwarded-host");
        if (forwardedHost && validateProxyHeader(forwardedHost, "host")) return forwardedHost;
    }
    const host = headers.get("host");
    if (host && validateProxyHeader(host, "host")) return host;
    if (isRequestLike(source)) try {
        return new URL(source.url).host;
    } catch  {
        return null;
    }
    return null;
}
/**
* Extracts the protocol from a `Request` or `Headers`.
* Honors `x-forwarded-proto` only when `trustedProxyHeaders` is enabled,
* then falls back to the request URL, then to "https".
*/ function getProtocolFromSource(source, configProtocol, trustedProxyHeaders) {
    if (configProtocol === "http" || configProtocol === "https") return configProtocol;
    const headers = isRequestLike(source) ? source.headers : source;
    if (trustedProxyHeaders) {
        const forwardedProto = headers.get("x-forwarded-proto");
        if (forwardedProto && validateProxyHeader(forwardedProto, "proto")) return forwardedProto;
    }
    if (isRequestLike(source)) try {
        const url = new URL(source.url);
        if (url.protocol === "http:" || url.protocol === "https:") return url.protocol.slice(0, -1);
    } catch  {}
    const host = getHostFromSource(source, trustedProxyHeaders);
    if (host && isLoopbackForDevScheme(host)) return "http";
    return "https";
}
/**
* Matches a hostname against a host pattern.
* Supports wildcard patterns like `*.vercel.app` or `preview-*.myapp.com`.
*
* @param host The hostname to test (e.g., "myapp.com", "preview-123.vercel.app")
* @param pattern The host pattern (e.g., "myapp.com", "*.vercel.app")
* @returns {boolean} true if the host matches the pattern, false otherwise.
*
* @example
* ```ts
* matchesHostPattern("myapp.com", "myapp.com") // true
* matchesHostPattern("preview-123.vercel.app", "*.vercel.app") // true
* matchesHostPattern("preview-123.myapp.com", "preview-*.myapp.com") // true
* matchesHostPattern("evil.com", "myapp.com") // false
* ```
*/ const matchesHostPattern = (host, pattern)=>{
    if (!host || !pattern) return false;
    const normalizedHost = host.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    const normalizedPattern = pattern.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    if (normalizedPattern.includes("*") || normalizedPattern.includes("?")) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f$better$2d$auth$40$1$2e$7$2e$6$2b$b409ffb9b0b51e48$2f$node_modules$2f$better$2d$auth$2f$dist$2f$utils$2f$wildcard$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__["wildcardMatch"])(normalizedPattern)(normalizedHost);
    return normalizedHost.toLowerCase() === normalizedPattern.toLowerCase();
};
/**
* Resolves the base URL from a dynamic config based on the incoming request.
* Validates the derived host against the allowedHosts allowlist.
*
* @param config The dynamic base URL config
* @param request The incoming request
* @param basePath The base path to append
* @returns The resolved base URL with path
* @throws BetterAuthError if host is not in allowedHosts and no fallback is set
*/ function resolveDynamicBaseURL(config, source, basePath, trustedProxyHeaders) {
    const host = getHostFromSource(source, trustedProxyHeaders);
    if (!host) {
        if (config.fallback) return withPath(config.fallback, basePath);
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"]("Could not determine host from request headers. Please provide a fallback URL in your baseURL config.");
    }
    if (config.allowedHosts.some((pattern)=>matchesHostPattern(host, pattern))) return withPath(`${getProtocolFromSource(source, config.protocol, trustedProxyHeaders)}://${host}`, basePath);
    if (config.fallback) return withPath(config.fallback, basePath);
    throw new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$bun$2f40$better$2d$auth$2b$core$40$1$2e$7$2e$6$2b$d17658d11a503265$2f$node_modules$2f40$better$2d$auth$2f$core$2f$dist$2f$error$2f$index$2e$mjs__$5b$middleware$5d$__$28$ecmascript$29$__$3c$locals$3e$__["BetterAuthError"](`Host "${host}" is not in the allowed hosts list. Allowed hosts: ${config.allowedHosts.join(", ")}. Add this host to your allowedHosts config or provide a fallback URL.`);
}
/**
* Resolves the base URL from any config type (static string or dynamic object).
* This is the main entry point for base URL resolution.
*
* @param config The base URL config (string or object)
* @param basePath The base path to append
* @param request Optional request for dynamic resolution
* @param loadEnv Whether to load from environment variables
* @param trustedProxyHeaders Whether to trust proxy headers (for legacy behavior)
* @returns The resolved base URL with path
*/ function resolveBaseURL(config, basePath, source, loadEnv, trustedProxyHeaders) {
    if (isDynamicBaseURLConfig(config)) {
        if (source) return resolveDynamicBaseURL(config, source, basePath, trustedProxyHeaders);
        if (config.fallback) return withPath(config.fallback, basePath);
        return getBaseURL(void 0, basePath, void 0, loadEnv, trustedProxyHeaders);
    }
    const request = isRequestLike(source) ? source : void 0;
    if (typeof config === "string") return getBaseURL(config, basePath, request, loadEnv, trustedProxyHeaders);
    return getBaseURL(void 0, basePath, request, loadEnv, trustedProxyHeaders);
}
;
}),
"[project]/node_modules/.bun/better-auth@1.7.6+b409ffb9b0b51e48/node_modules/better-auth/dist/utils/wildcard.mjs [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "wildcardMatch",
    ()=>wildcardMatch
]);
//#region src/utils/wildcard.ts
/**
* Escapes a character if it has a special meaning in regular expressions
* and returns the character as is if it doesn't
*/ function escapeRegExpChar(char) {
    if (char === "-" || char === "^" || char === "$" || char === "+" || char === "." || char === "(" || char === ")" || char === "|" || char === "[" || char === "]" || char === "{" || char === "}" || char === "*" || char === "?" || char === "\\") return `\\${char}`;
    else return char;
}
/**
* Escapes all characters in a given string that have a special meaning in regular expressions
*/ function escapeRegExpString(str) {
    let result = "";
    for(let i = 0; i < str.length; i++)result += escapeRegExpChar(str[i]);
    return result;
}
/**
* Transforms one or more glob patterns into a RegExp pattern
*/ function transform(pattern, separator = true) {
    if (Array.isArray(pattern)) return `(?:${pattern.map((p)=>`^${transform(p, separator)}$`).join("|")})`;
    let separatorSplitter = "";
    let separatorMatcher = "";
    let wildcard = ".";
    if (separator === true) {
        separatorSplitter = "/";
        separatorMatcher = "[/\\\\]";
        wildcard = "[^/\\\\]";
    } else if (separator) {
        separatorSplitter = separator;
        separatorMatcher = escapeRegExpString(separatorSplitter);
        if (separatorMatcher.length > 1) {
            separatorMatcher = `(?:${separatorMatcher})`;
            wildcard = `((?!${separatorMatcher}).)`;
        } else wildcard = `[^${separatorMatcher}]`;
    }
    const requiredSeparator = separator ? `${separatorMatcher}+?` : "";
    const optionalSeparator = separator ? `${separatorMatcher}*?` : "";
    const segments = separator ? pattern.split(separatorSplitter) : [
        pattern
    ];
    let result = "";
    for(let s = 0; s < segments.length; s++){
        const segment = segments[s];
        const nextSegment = segments[s + 1];
        let currentSeparator = "";
        if (!segment && s > 0) continue;
        if (separator) if (s === segments.length - 1) currentSeparator = optionalSeparator;
        else if (nextSegment !== "**") currentSeparator = requiredSeparator;
        else currentSeparator = "";
        if (separator && segment === "**") {
            if (currentSeparator) {
                result += s === 0 ? "" : currentSeparator;
                result += `(?:${wildcard}*?${currentSeparator})*?`;
            }
            continue;
        }
        for(let c = 0; c < segment.length; c++){
            const char = segment[c];
            if (char === "\\") {
                if (c < segment.length - 1) {
                    result += escapeRegExpChar(segment[c + 1]);
                    c++;
                }
            } else if (char === "?") result += wildcard;
            else if (char === "*") result += `${wildcard}*?`;
            else result += escapeRegExpChar(char);
        }
        result += currentSeparator;
    }
    return result;
}
function isMatch(regexp, sample) {
    if (typeof sample !== "string") throw new TypeError(`Sample must be a string, but ${typeof sample} given`);
    return regexp.test(sample);
}
/**
* Compiles one or more glob patterns into a RegExp and returns an isMatch function.
* The isMatch function takes a sample string as its only argument and returns `true`
* if the string matches the pattern(s).
*
* ```js
* wildcardMatch('src/*.js')('src/index.js') //=> true
* ```
*
* ```js
* const isMatch = wildcardMatch('*.example.com', '.')
* isMatch('foo.example.com') //=> true
* isMatch('foo.bar.com') //=> false
* ```
*/ function wildcardMatch(pattern, options) {
    if (typeof pattern !== "string" && !Array.isArray(pattern)) throw new TypeError(`The first argument must be a single pattern string or an array of patterns, but ${typeof pattern} given`);
    if (typeof options === "string" || typeof options === "boolean") options = {
        separator: options
    };
    if (arguments.length === 2 && !(typeof options === "undefined" || typeof options === "object" && options !== null && !Array.isArray(options))) throw new TypeError(`The second argument must be an options object or a string/boolean separator, but ${typeof options} given`);
    options = options || {};
    if (options.separator === "\\") throw new Error("\\ is not a valid separator because it is used for escaping. Try setting the separator to `true` instead");
    const regexpPattern = transform(pattern, options.separator);
    const regexp = new RegExp(`^${regexpPattern}$`, options.flags);
    const fn = isMatch.bind(null, regexp);
    fn.options = options;
    fn.pattern = pattern;
    fn.regexp = regexp;
    return fn;
}
;
}),
];})()