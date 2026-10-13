import { offlineDocument, type PwaLocale } from "./pwa";

/** Only immutable application assets are cached; pages and media remain network owned. */
export function serviceWorkerSource(locale: PwaLocale, staticOrigin: string): string {
  const config = JSON.stringify({
    staticOrigin,
    offline: offlineDocument(locale),
    documents: { fr: offlineDocument("fr"), en: offlineDocument("en"), ja: offlineDocument("ja") },
  });
  return String.raw`"use strict";
const config = ${config};
const prefix = "dbfr-pwa-";
const cacheName = prefix + "v1";
const offlineUrl = new URL("/__dbfr_offline__", self.location.origin).href;
const icons = new Set(["/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png"]);
const fallback = () => new Response(config.offline, {headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"}});
self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.put(offlineUrl, fallback())));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "DBFR_ACTIVATE_UPDATE") self.skipWaiting();
  if (event.data?.type === "DBFR_LOCALE" && Object.hasOwn(config.documents, event.data.locale)) {
    event.waitUntil(caches.open(cacheName).then(cache => cache.put(offlineUrl, new Response(config.documents[event.data.locale], {headers:{"Content-Type":"text/html; charset=utf-8"}}))));
  }
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range") || request.headers.has("authorization")) return;
  const url = new URL(request.url);
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(offlineUrl)) || fallback()));
    return;
  }
  const immutable = (url.origin === self.location.origin || url.origin === config.staticOrigin) &&
    url.pathname.startsWith("/_next/static/") && /\.(?:js|css|woff2)$/.test(url.pathname);
  const icon = url.origin === self.location.origin && icons.has(url.pathname) && !url.search;
  if ((!immutable && !icon) || url.search || request.headers.has("rsc") || request.headers.has("next-router-state-tree")) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const saved = await cache.match(request);
    if (saved) return saved;
    const response = await fetch(request);
    const control = response.headers.get("cache-control") || "";
    if (response.ok && !response.redirected && response.type !== "opaque" && !/private|no-store/.test(control) && !/cookie|authorization/i.test(response.headers.get("vary") || "")) {
      event.waitUntil((async () => {
        const copy = response.clone();
        if ((await copy.clone().arrayBuffer()).byteLength > 2097152) return;
        await cache.put(request, copy);
        const keys = await cache.keys();
        const assets = keys.filter(key => key.url !== offlineUrl);
        await Promise.all(assets.slice(0, Math.max(0, assets.length - 60)).map(key => cache.delete(key)));
      })().catch(() => {}));
    }
    return response;
  })());
});
`;
}
