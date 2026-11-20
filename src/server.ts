import { Database } from "bun:sqlite";

const PORT = Number(Bun.env.PORT ?? 3000);
const HOST = Bun.env.HOST ?? "0.0.0.0";
const DB_PATH = Bun.env.SHENRON_DB ?? "./shenron.sqlite";
const ADMIN_TOKEN = Bun.env.SHENRON_ADMIN_TOKEN ?? "";
const STARTED_AT = Date.now();

const db = new Database(DB_PATH, { create: true, strict: true });
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = NORMAL;");
db.run("PRAGMA foreign_keys = ON;");
db.run("PRAGMA busy_timeout = 5000;");

db.run(`
  CREATE TABLE IF NOT EXISTS pages (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    body TEXT NOT NULL,
    etag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    slug, title, category, body, content='pages', content_rowid='rowid'
  );
  CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
    INSERT INTO pages_fts(rowid, slug, title, category, body)
    VALUES (new.rowid, new.slug, new.title, new.category, new.body);
  END;
  CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, slug, title, category, body)
    VALUES ('delete', old.rowid, old.slug, old.title, old.category, old.body);
  END;
  CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, slug, title, category, body)
    VALUES ('delete', old.rowid, old.slug, old.title, old.category, old.body);
    INSERT INTO pages_fts(rowid, slug, title, category, body)
    VALUES (new.rowid, new.slug, new.title, new.category, new.body);
  END;
`);

const stmts = {
  list: db.query("SELECT slug, title, category, etag, updated_at FROM pages ORDER BY updated_at DESC LIMIT ?1 OFFSET ?2"),
  get: db.query("SELECT slug, title, category, body, etag, created_at, updated_at FROM pages WHERE slug = ?1"),
  count: db.query("SELECT COUNT(*) as total FROM pages"),
  search: db.query("SELECT p.slug, p.title, p.category, snippet(pages_fts, 3, '<mark>', '</mark>', '...', 24) as excerpt, p.updated_at FROM pages_fts JOIN pages p ON p.rowid = pages_fts.rowid WHERE pages_fts MATCH ?1 ORDER BY rank LIMIT 25"),
  upsert: db.query(`
    INSERT INTO pages (slug, title, category, body, etag, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      body = excluded.body,
      etag = excluded.etag,
      updated_at = excluded.updated_at
  `),
  del: db.query("DELETE FROM pages WHERE slug = ?1"),
};

const rateMap = new Map<string, { count: number; resetAt: number }>();
let reqTotal = 0;

function checkRate(ip: string, limit = 120): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

function isAuthorized(req: Request): boolean {
  if (!ADMIN_TOKEN) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${ADMIN_TOKEN}`;
}

function secHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
    ...extra,
  };
}

function computeEtag(input: string): string {
  return `"${Bun.hash(input).toString(16)}"`;
}

const UI_HTML = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Shenron — Self-Hosted Knowledge Engine</title>
  <style>
    :root {
      color-scheme: light dark;
      --md-sys-color-surface: light-dark(#fef7ff, #141218);
      --md-sys-color-surface-container: light-dark(#f3edf7, #211f26);
      --md-sys-color-on-surface: light-dark(#1d1b20, #e6e0e9);
      --md-sys-color-primary: light-dark(#b3261e, #ffb4ab);
      --md-sys-color-outline: light-dark(#79747e, #938f99);
      font-family: "Google Sans Flex", system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--md-sys-color-surface); color: var(--md-sys-color-on-surface); line-height: 1.5; }
    header, main { max-width: 80ch; margin: 0 auto; padding: 1.25rem; }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--md-sys-color-outline); }
    h1 { margin: 0; color: var(--md-sys-color-primary); font-size: 1.5rem; }
    .card { background: var(--md-sys-color-surface-container); padding: 1rem; border-radius: 12px; margin-bottom: 1rem; }
    input, textarea, button { font: inherit; padding: 0.55rem 0.75rem; border-radius: 8px; border: 1px solid var(--md-sys-color-outline); background: transparent; color: inherit; }
    button { background: var(--md-sys-color-primary); color: var(--md-sys-color-surface); border: none; cursor: pointer; font-weight: 600; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { padding: 0.5rem 0; border-bottom: 1px solid var(--md-sys-color-outline); }
  </style>
</head>
<body>
  <header>
    <h1>Shenron</h1>
    <nav aria-label="API"><a href="/health">Health</a> · <a href="/metrics">Metrics</a></nav>
  </header>
  <main>
    <section class="card" aria-label="Search">
      <input id="q" type="search" placeholder="Rechercher (FTS5)..." style="width:100%">
    </section>
    <section class="card" aria-label="Pages">
      <ul id="list"></ul>
    </section>
  </main>
  <script>
    const list = document.getElementById("list");
    const q = document.getElementById("q");
    async function load(term = "") {
      const url = term ? "/api/search?q=" + encodeURIComponent(term) : "/api/pages";
      const res = await fetch(url);
      const data = await res.json();
      const items = data.results ?? data.pages ?? [];
      list.innerHTML = items.length
        ? items.map(p => "<li><strong>" + p.title + "</strong> <small>(" + p.slug + ")</small></li>").join("")
        : "<li>Aucune page enregistrée.</li>";
    }
    q.addEventListener("input", () => load(q.value.trim()));
    load();
  </script>
</body>
</html>`;

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  routes: {
    "/": () => new Response(UI_HTML, { headers: secHeaders({ "content-type": "text/html; charset=utf-8" }) }),
    "/health": () => {
      const { total } = stmts.count.get() as { total: number };
      return Response.json(
        {
          ok: true,
          app: "shenron",
          runtime: `bun-${Bun.version}`,
          uptime_ms: Date.now() - STARTED_AT,
          pages: total,
          memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        { headers: secHeaders() },
      );
    },
    "/metrics": () => {
      const { total } = stmts.count.get() as { total: number };
      const body = [
        `shenron_requests_total ${reqTotal}`,
        `shenron_pages_total ${total}`,
        `shenron_uptime_seconds ${Math.floor((Date.now() - STARTED_AT) / 1000)}`,
      ].join("\n") + "\n";
      return new Response(body, { headers: secHeaders({ "content-type": "text/plain; version=0.0.4" }) });
    },
    "/api/pages": {
      GET: (req) => {
        reqTotal++;
        const url = new URL(req.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
        return Response.json({ pages: stmts.list.all(limit, offset) }, { headers: secHeaders() });
      },
      POST: async (req) => {
        reqTotal++;
        if (!isAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401, headers: secHeaders() });
        const body = (await req.json()) as { slug?: string; title?: string; category?: string; body?: string };
        if (!body.slug || !body.title || typeof body.body !== "string") {
          return Response.json({ error: "slug, title, body required" }, { status: 400, headers: secHeaders() });
        }
        const now = Date.now();
        const etag = computeEtag(`${body.slug}:${body.title}:${body.body}:${now}`);
        stmts.upsert.run(body.slug, body.title, body.category ?? "general", body.body, etag, now);
        return Response.json({ ok: true, slug: body.slug, etag }, { status: 201, headers: secHeaders({ etag }) });
      },
    },
    "/api/search": (req) => {
      reqTotal++;
      const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
      if (!q) return Response.json({ results: [] }, { headers: secHeaders() });
      return Response.json({ results: stmts.search.all(q) }, { headers: secHeaders() });
    },
  },
  fetch(req, srv) {
    reqTotal++;
    const ip = srv.requestIP(req)?.address ?? "local";
    if (!checkRate(ip)) return Response.json({ error: "rate_limited" }, { status: 429, headers: secHeaders() });

    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/pages/")) {
      const slug = decodeURIComponent(url.pathname.slice("/api/pages/".length));
      if (req.method === "GET") {
        const row = stmts.get.get(slug) as { etag: string } | null;
        if (!row) return Response.json({ error: "not_found" }, { status: 404, headers: secHeaders() });
        if (req.headers.get("if-none-match") === row.etag) {
          return new Response(null, { status: 304, headers: secHeaders({ etag: row.etag }) });
        }
        return Response.json(row, { headers: secHeaders({ etag: row.etag }) });
      }
      if (req.method === "DELETE") {
        if (!isAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401, headers: secHeaders() });
        stmts.del.run(slug);
        return Response.json({ ok: true, deleted: slug }, { headers: secHeaders() });
      }
    }
    return Response.json({ error: "not_found" }, { status: 404, headers: secHeaders() });
  },
});

function shutdown() {
  server.stop(true);
  db.close(false);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`shenron ready on http://${HOST}:${server.port} (db=${DB_PATH})`);
