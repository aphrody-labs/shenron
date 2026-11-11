/**
 * fetchCachedImage / imageResponse contre un serveur Bun local (127.0.0.1 uniquement, aucun reseau externe).
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const { cacheKey, fetchCachedImage, imageResponse, serveProxiedImage, takeUpstreamToken } =
  await import("../src/lib/upstream-image-cache");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const opts = { maxBytes: 1000, ttlMs: 60_000, userAgent: "ShenronAuditTest/1.0" };

let server: ReturnType<typeof Bun.serve>;
let base = "";
let hugeSent = 0;
let chunkedPulled = 0;
let inFlightNow = 0;
let inFlightPeak = 0;
const hits = new Map<string, number>();
const seenHeaders: Record<string, Headers> = {};

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 30,
    fetch(req) {
      const p = new URL(req.url).pathname;
      hits.set(p, (hits.get(p) ?? 0) + 1);
      seenHeaders[p] = req.headers;
      if (p.startsWith("/slowish/")) {
        inFlightNow++;
        inFlightPeak = Math.max(inFlightPeak, inFlightNow);
        return new Promise<Response>((resolve) =>
          setTimeout(() => {
            inFlightNow--;
            resolve(new Response(PNG, { headers: { "content-type": "image/png" } }));
          }, 20),
        );
      }
      if (p.startsWith("/404/")) return new Response("nope", { status: 404 });
      if (p.startsWith("/ok")) {
        return new Response(PNG, {
          headers: {
            "content-type": "image/png",
            "set-cookie": "WMF-Uniq=secret; Path=/",
            location: "https://evil.example/",
            "x-upstream-secret": "leak",
            "content-disposition": "attachment",
            "access-control-allow-origin": "*",
          },
        });
      }
      switch (p) {
        case "/redirect":
          return new Response(null, { status: 302, headers: { location: `${base}/target` } });
        case "/redirect-external":
          return new Response(null, {
            status: 301,
            headers: { location: "http://169.254.169.254/latest/meta-data/" },
          });
        case "/target":
          return new Response(PNG, { headers: { "content-type": "image/png" } });
        case "/html":
          return new Response("<script>alert(1)</script>", {
            headers: { "content-type": "text/html" },
          });
        case "/js-as-image":
          return new Response("alert(1)", {
            headers: { "content-type": "application/javascript" },
          });
        case "/notype":
          return new Response(PNG);
        case "/type-upper":
          return new Response(PNG, { headers: { "content-type": "IMAGE/PNG" } });
        case "/type-params":
          return new Response(PNG, { headers: { "content-type": "image/png; charset=binary" } });
        case "/type-tiff":
          return new Response(PNG, { headers: { "content-type": "image/tiff" } });
        case "/svg":
          return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>',
            { headers: { "content-type": "image/svg+xml; charset=utf-8" } },
          );
        case "/big-declared":
          return new Response(new Uint8Array(1001), { headers: { "content-type": "image/png" } });
        case "/exact-max":
          return new Response(new Uint8Array(1000), { headers: { "content-type": "image/png" } });
        case "/big-chunked":
          return new Response(
            new ReadableStream({
              pull(c) {
                c.enqueue(new Uint8Array(500));
                chunkedPulled += 500;
                if (chunkedPulled >= 2000) c.close();
              },
            }),
            { headers: { "content-type": "image/png" } },
          );
        case "/huge-chunked":
          return new Response(
            new ReadableStream({
              pull(c) {
                c.enqueue(new Uint8Array(64 * 1024));
                hugeSent += 64 * 1024;
                if (hugeSent >= 8 * 1024 * 1024) c.close();
              },
            }),
            { headers: { "content-type": "image/png" } },
          );
        case "/gzip-bomb":
          return new Response(Bun.gzipSync(new Uint8Array(3 * 1024 * 1024)), {
            headers: { "content-type": "image/png", "content-encoding": "gzip" },
          });
        case "/slow-body":
          return new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new Uint8Array(10));
              },
              pull() {
                return new Promise(() => {});
              },
            }),
            { headers: { "content-type": "image/png" } },
          );
        case "/slow-headers":
          return new Promise<Response>(() => {});
        case "/404":
          return new Response("nope", { status: 404 });
        case "/403":
          return new Response("nope", { status: 403 });
        case "/400":
          return new Response("nope", { status: 400 });
        case "/500":
          return new Response("boom", { status: 500, headers: { "content-type": "image/png" } });
        default:
          return new Response(PNG, { headers: { "content-type": "image/png" } });
      }
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));

describe("fetchCachedImage : refus", () => {
  test("redirect (meme hote ou metadata cloud) refuse, cible jamais atteinte", async () => {
    const a = await fetchCachedImage(`${base}/redirect`, opts);
    expect(a.status).toBe(502);
    expect(a.body).toBeNull();
    const b = await fetchCachedImage(`${base}/redirect-external`, opts);
    expect(b.status).toBe(502);
    expect(b.body).toBeNull();
    expect(hits.get("/target") ?? 0).toBe(0);
  });
  test("types non image refuses (html, js, absent, tiff, majuscules)", async () => {
    for (const p of ["/html", "/js-as-image", "/notype", "/type-tiff", "/type-upper"]) {
      const r = await fetchCachedImage(`${base}${p}`, opts);
      expect(r.status).toBe(502);
      expect(r.body).toBeNull();
      expect(r.type).toBe("");
    }
  });
  test("image/png avec parametres accepte, type normalise", async () => {
    const r = await fetchCachedImage(`${base}/type-params`, opts);
    expect(r.status).toBe(200);
    expect(r.type).toBe("image/png");
  });
  test("statuts amont : 400/403/404 -> 404, 500 -> 502", async () => {
    for (const p of ["/400", "/403", "/404"]) {
      expect((await fetchCachedImage(`${base}${p}`, opts)).status).toBe(404);
    }
    expect((await fetchCachedImage(`${base}/500`, opts)).status).toBe(502);
  });
});

describe("fetchCachedImage : taille", () => {
  test("content-length declare trop grand -> 502", async () => {
    const r = await fetchCachedImage(`${base}/big-declared`, opts);
    expect(r.status).toBe(502);
    expect(r.body).toBeNull();
  });
  test("exactement maxBytes accepte", async () => {
    const r = await fetchCachedImage(`${base}/exact-max`, opts);
    expect(r.status).toBe(200);
    expect(r.body?.byteLength).toBe(1000);
  });
  test("corps chunked sans content-length depassant maxBytes -> 502", async () => {
    const r = await fetchCachedImage(`${base}/big-chunked`, opts);
    expect(r.status).toBe(502);
    expect(r.body).toBeNull();
  });
  test("bombe gzip (3 MiB decompresses) -> 502", async () => {
    const r = await fetchCachedImage(`${base}/gzip-bomb`, opts);
    expect(r.status).toBe(502);
    expect(r.body).toBeNull();
  });
  // La limite est verifiee pendant la lecture : le flux amont est annule des que maxBytes est depasse.
  test("la lecture s'arrete des que maxBytes est depasse (pas de tampon integral)", async () => {
    hugeSent = 0;
    const r = await fetchCachedImage(`${base}/huge-chunked`, { ...opts, maxBytes: 1000 });
    expect(r.status).toBe(502);
    expect(hugeSent).toBeLessThan(1024 * 1024);
  });
});

describe("fetchCachedImage : delais", () => {
  test("corps sans fin et en-tetes absents -> 502 vers 6 s", async () => {
    const t0 = Date.now();
    const [a, b] = await Promise.all([
      fetchCachedImage(`${base}/slow-body`, opts),
      fetchCachedImage(`${base}/slow-headers`, opts),
    ]);
    const dt = Date.now() - t0;
    expect(a.status).toBe(502);
    expect(b.status).toBe(502);
    expect(dt).toBeGreaterThan(5000);
    expect(dt).toBeLessThan(9000);
  }, 15_000);
});

describe("aucun en-tete amont relaye", () => {
  test("CachedImage ne porte que status/body/type/expires", async () => {
    const r = await fetchCachedImage(`${base}/ok1`, opts);
    expect(Object.keys(r).toSorted()).toEqual(["body", "expires", "status", "type"]);
    expect(r.status).toBe(200);
  });
  test("la reponse HTTP n'a ni Set-Cookie, ni Location, ni en-tetes amont", async () => {
    const res = imageResponse(await fetchCachedImage(`${base}/ok2`, opts), 604_800);
    expect([...res.headers.keys()].toSorted()).toEqual([
      "cache-control",
      "content-type",
      "cross-origin-resource-policy",
      "x-content-type-options",
    ]);
    for (const h of [
      "set-cookie",
      "location",
      "x-upstream-secret",
      "content-disposition",
      "access-control-allow-origin",
    ]) {
      expect(res.headers.get(h)).toBeNull();
    }
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-site");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });
  test("requete sortante : user-agent fixe, accept image/*, ni cookie ni authorization", async () => {
    await fetchCachedImage(`${base}/ok3`, opts);
    const h = seenHeaders["/ok3"]!;
    expect(h.get("user-agent")).toBe(opts.userAgent);
    expect(h.get("accept")).toBe("image/*");
    expect(h.get("cookie")).toBeNull();
    expect(h.get("authorization")).toBeNull();
  });
  test("erreurs : sans corps, no-store (502) ou max-age=300 (404)", () => {
    const e = imageResponse({ status: 502, body: null, type: "", expires: 0 }, 1);
    expect(e.status).toBe(502);
    expect(e.headers.get("cache-control")).toBe("no-store");
    const n = imageResponse({ status: 404, body: null, type: "", expires: 0 }, 1);
    expect(n.headers.get("cache-control")).toBe("public, max-age=300");
  });
});

describe("SVG servi depuis l'origine first-party", () => {
  test("SVG accepte mais renvoye avec CSP sandbox + nosniff (scripts non executables)", async () => {
    const r = await fetchCachedImage(`${base}/svg`, opts);
    expect(r.status).toBe(200);
    expect(r.type).toBe("image/svg+xml");
    const res = imageResponse(r, 1);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("allow-scripts");
    expect(csp).not.toContain("script-src");
  });
  test("les non-SVG n'ont pas de CSP", async () => {
    const png = imageResponse(await fetchCachedImage(`${base}/ok4`, opts), 1);
    expect(png.headers.get("content-security-policy")).toBeNull();
  });
});

describe("cle de cache, amplification, eviction", () => {
  test("meme URL : un seul aller-retour (dedoublonnage en vol + cache)", async () => {
    const url = `${base}/dedupe`;
    await Promise.all(Array.from({ length: 50 }, () => fetchCachedImage(url, opts)));
    await fetchCachedImage(url, opts);
    expect(hits.get("/dedupe")).toBe(1);
  });
  test("cle = URL exacte : variantes de query/casse = requetes amont distinctes (documente)", async () => {
    for (let i = 0; i < 20; i++) await fetchCachedImage(`${base}/amp?k=${i}`, opts);
    await fetchCachedImage(`${base}/AMP`, opts);
    expect(hits.get("/amp")).toBe(20);
    expect(hits.get("/AMP")).toBe(1);
  });
  test("inondation de cles distinctes (650 > 600) evince une entree legitime (LRU)", async () => {
    await fetchCachedImage(`${base}/legit`, opts);
    expect(hits.get("/legit")).toBe(1);
    for (let i = 0; i < 650; i++) await fetchCachedImage(`${base}/flood/${i}`, opts);
    await fetchCachedImage(`${base}/legit`, opts);
    expect(hits.get("/legit")).toBe(2);
  }, 30_000);
  test("200 cles distinctes en parallele : toutes servies, fetchs amont simultanes <= 8", async () => {
    inFlightPeak = 0;
    await Promise.all(
      Array.from({ length: 200 }, (_, i) => fetchCachedImage(`${base}/slowish/${i}`, opts)),
    );
    let n = 0;
    for (let i = 0; i < 200; i++) n += hits.get(`/slowish/${i}`) ?? 0;
    expect(n).toBe(200);
    expect(inFlightPeak).toBeLessThanOrEqual(8);
    expect(inFlightPeak).toBeGreaterThan(1);
  }, 30_000);
  test("file d'attente pleine : refus 502 sans fetch amont", async () => {
    const o = { ...opts, maxConcurrent: 1, maxQueue: 1 };
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => fetchCachedImage(`${base}/slowish/q${i}`, o)),
    );
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(results.filter((r) => r.status === 502).length).toBeGreaterThanOrEqual(1);
  });
  test("cle de cache normalisee : %2f/%2F et URL equivalentes = une seule requete amont", async () => {
    expect(cacheKey(`${base}/n/a%2fb.png`)).toBe(cacheKey(`${base}/n/a%2Fb.png`));
    expect(cacheKey("https://UPLOAD.wikimedia.org:443/a/b.png")).toBe(
      "https://upload.wikimedia.org/a/b.png",
    );
    await fetchCachedImage(`${base}/norm/a%2fb.png`, opts);
    await fetchCachedImage(`${base}/norm/a%2Fb.png`, opts);
    expect((hits.get("/norm/a%2fb.png") ?? 0) + (hits.get("/norm/a%2Fb.png") ?? 0)).toBe(1);
  });
  test("entrees negatives : borne propre (100), les images valides ne sont pas evincees", async () => {
    await fetchCachedImage(`${base}/keeper`, opts);
    const before = hits.get("/keeper");
    for (let i = 0; i < 250; i++) await fetchCachedImage(`${base}/404/${i}`, opts);
    await fetchCachedImage(`${base}/keeper`, opts);
    expect(hits.get("/keeper")).toBe(before);
    // Les 404 les plus anciens (>100 derriere) ont ete oublies, les recents sont retenus.
    await fetchCachedImage(`${base}/404/249`, opts);
    expect(hits.get("/404/249")).toBe(1);
    await fetchCachedImage(`${base}/404/0`, opts);
    expect(hits.get("/404/0")).toBe(2);
  }, 30_000);
});

describe("limite de debit par IP", () => {
  const req = (ip: string) =>
    new Request("http://x/api/ext-image/y", { headers: { "cf-connecting-ip": ip } });
  const o = { ...opts, maxBytes: 1000 };

  test("30 fetchs amont non caches par minute et par IP, puis 429 ; fenetre renouvelee", () => {
    const t = 1_000_000;
    for (let i = 0; i < 30; i++) expect(takeUpstreamToken("10.0.0.1", t + i)).toBe(true);
    expect(takeUpstreamToken("10.0.0.1", t + 31)).toBe(false);
    expect(takeUpstreamToken("10.0.0.2", t + 31)).toBe(true);
    expect(takeUpstreamToken("10.0.0.1", t + 60_001)).toBe(true);
  });
  test("serveProxiedImage : 429 apres 30 non caches, le cache reste servi", async () => {
    const ip = "203.0.113.7";
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) {
      statuses.push((await serveProxiedImage(req(ip), `${base}/rl/${i}`, o, 60)).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(30).every((s) => s === 429)).toBe(true);
    let upstream = 0;
    for (let i = 0; i < 40; i++) upstream += hits.get(`/rl/${i}`) ?? 0;
    expect(upstream).toBe(30);
    const cached = await serveProxiedImage(req(ip), `${base}/rl/3`, o, 60);
    expect(cached.status).toBe(200);
    const limited = await serveProxiedImage(req(ip), `${base}/rl/39`, o, 60);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    // Une autre IP n'est pas affectee.
    expect((await serveProxiedImage(req("203.0.113.8"), `${base}/rl/39`, o, 60)).status).toBe(200);
  });
  test("repli x-forwarded-for (dernier hop) quand cf-connecting-ip est absent", async () => {
    const r = (xff: string) => new Request("http://x/y", { headers: { "x-forwarded-for": xff } });
    for (let i = 0; i < 30; i++) {
      await serveProxiedImage(r("1.1.1.1, 198.51.100.9"), `${base}/xf/${i}`, o, 60);
    }
    const res = await serveProxiedImage(r("2.2.2.2, 198.51.100.9"), `${base}/xf/new`, o, 60);
    expect(res.status).toBe(429);
  });
});
