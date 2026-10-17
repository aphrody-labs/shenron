/**
 * Synthetic stand-in for `scripts/ops/dbxv2-serve.ts`: same routes and headers, invented bytes
 * (no game data). Supports Bearer auth, Range / If-Range, ETag / 304, and failure injection.
 */
export const TOKEN = "test-token-0123456789abcdef";

export interface FakeEntry {
  readonly cpk: string;
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface FakeServer {
  readonly url: string;
  readonly requests: { method: string; path: string; headers: Headers }[];
  /** Fails the next N requests to `/cpk` routes with this status. */
  failNext(status: number, times: number): void;
  /** Delays every answer by this many milliseconds (abort tests). */
  delay: number;
  /** Changes the content (and ETag) of an entry. */
  mutate(cpk: string, path: string, bytes: Uint8Array): void;
  stop(): void;
}

export function patterned(size: number, seed = 1): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = (i * 31 + seed) & 0xff;
  return out;
}

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

export function startFakeServer(entries: readonly FakeEntry[]): FakeServer {
  const store = new Map(entries.map((e) => [`${e.cpk}/${e.path}`, e.bytes]));
  const versions = new Map<string, number>();
  const requests: FakeServer["requests"] = [];
  let failStatus = 0;
  let failTimes = 0;
  const state = { delay: 0 };

  const etagOf = (key: string): string =>
    `"${key.length}-${versions.get(key) ?? 0}-${store.get(key)?.length ?? 0}"`;
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    "Cache-Control": "private, max-age=3600, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  const json = (value: unknown, status = 200): Response =>
    new Response(JSON.stringify(value), {
      status,
      headers: headers({ "Content-Type": "application/json; charset=utf-8" }),
    });

  const ranged = (req: Request, key: string, bytes: Uint8Array, type: string): Response => {
    const etag = etagOf(key);
    const base = headers({ "Content-Type": type, "Accept-Ranges": "bytes", ETag: etag });
    if (
      req.headers
        .get("if-none-match")
        ?.split(",")
        .some((v) => v.trim() === etag)
    )
      return new Response(null, { status: 304, headers: base });
    const range = req.headers.get("range");
    const ifRange = req.headers.get("if-range");
    const m = range && (!ifRange || ifRange === etag) ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (!m)
      return new Response(bytes as BodyInit, {
        headers: { ...base, "Content-Length": String(bytes.length) },
      });
    const size = bytes.length;
    let start: number;
    let end: number;
    if (m[1] === "") {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (start >= size || start > end)
      return new Response(null, {
        status: 416,
        headers: { ...base, "Content-Range": `bytes */${size}` },
      });
    return new Response(bytes.subarray(start, end + 1) as BodyInit, {
      status: 206,
      headers: {
        ...base,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    });
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      requests.push({ method: req.method, path: url.pathname + url.search, headers: req.headers });
      if (state.delay) await Bun.sleep(state.delay);
      if (url.pathname === "/health") return json({ ok: true });
      if (req.headers.get("authorization") !== `Bearer ${TOKEN}`)
        return json({ error: "unauthorized" }, 401);
      if (failTimes > 0) {
        failTimes--;
        return json({ error: "injected" }, failStatus);
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] !== "cpk") return json({ error: "not found" }, 404);
      if (parts.length === 1) {
        const names = [...new Set(entries.map((e) => e.cpk))].toSorted();
        return json(names.map((name) => ({ name, size: 1000, mtime: "2026-01-01T00:00:00.000Z" })));
      }
      const cpk = parts[1]!;
      const action = parts[2];
      const rest = parts.slice(3).map(decodeURIComponent).join("/");
      if (action === "find") {
        const q = url.searchParams.get("q") ?? "";
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const all = [...store.entries()]
          .filter(([key]) => key.startsWith(`${cpk}/`))
          .map(([key, bytes]) => ({
            cpk,
            path: key.slice(cpk.length + 1),
            offset: 0,
            size: bytes.length,
            extract_size: bytes.length,
            compressed: false,
          }))
          .filter(
            (e) =>
              !q || (q.startsWith("ext:") ? e.path.endsWith(`.${q.slice(4)}`) : e.path.includes(q)),
          );
        return json({
          total: all.length,
          offset,
          limit,
          entries: all.slice(offset, offset + limit),
        });
      }
      const modelMatch = action === "model" ? /^(.*)\.(json|glb)$/.exec(rest) : null;
      const key = `${cpk}/${modelMatch ? modelMatch[1] : rest}`;
      const bytes = store.get(key);
      if (!bytes) return json({ error: "entry not found" }, 404);
      if (action === "raw") return ranged(req, key, bytes, "application/octet-stream");
      if (action === "png")
        return ranged(
          req,
          key,
          new Uint8Array([...PNG_MAGIC, ...bytes.subarray(0, 8)]),
          "image/png",
        );
      if (action === "wav") return ranged(req, key, bytes, "audio/wav");
      if (action === "video") return ranged(req, key, bytes, "video/mp4");
      if (modelMatch) {
        if (modelMatch[2] === "glb") return ranged(req, key, bytes, "model/gltf-binary");
        const body = new TextEncoder().encode(
          JSON.stringify({
            name: key,
            primitives: [
              {
                name: "p0",
                materialName: "m0",
                positions: [
                  [0, 0, 0],
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                normals: [],
                uv: [],
                indices: [0, 1, 2],
                textureIndex: 0,
              },
            ],
            textures: [{ width: 4, height: 4 }],
            skeleton: null,
          }),
        );
        return ranged(req, key, body, "application/json");
      }
      return json({ error: "not found" }, 404);
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    failNext(status, times) {
      failStatus = status;
      failTimes = times;
    },
    get delay() {
      return state.delay;
    },
    set delay(ms: number) {
      state.delay = ms;
    },
    mutate(cpk, path, bytes) {
      const key = `${cpk}/${path}`;
      store.set(key, bytes);
      versions.set(key, (versions.get(key) ?? 0) + 1);
    },
    stop: () => void server.stop(true),
  };
}
