// SPDX-License-Identifier: Apache-2.0
import { mkdir, lstat, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, extname, relative } from "node:path";
import {
  koharuBridge,
  KOHARU_PATH,
  type KoharuBridge,
  type SpawnEngine,
} from "@aphrody/shenron-koharu/web-server";

const MAX_UPLOAD = 96 * 1024 * 1024;
const MAX_FILES = 100;
const MAX_ENGINES = 4;
const IDLE_MS = 30 * 60_000;
const SESSION = /^[A-Za-z0-9-]{8,64}$/;
const FORMATS = new Set(["png", "psd", "cbz"]);
const EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".gif",
  ".pdf",
  ".cbz",
  ".zip",
]);
const PRIVATE = { "cache-control": "no-store" };

interface StudioOptions {
  binary?: string;
  home?: string;
  spawn?: SpawnEngine;
  now?: () => number;
  origin?: string;
}
interface Engine {
  bridge: KoharuBridge;
  io: string;
  touched: number;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: PRIVATE });
}

/** Staff editor state belongs to one identity, never to the site's database or provider home. */
export function createStudioRuntime(options: StudioOptions) {
  const engines = new Map<string, Promise<Engine>>();
  const now = options.now ?? Date.now;
  const sweep = async () => {
    for (const [owner, pending] of engines) {
      const engine = await pending.catch(() => null);
      if (engine && now() - engine.touched > IDLE_MS && engines.get(owner) === pending) {
        engines.delete(owner);
        engine.bridge.stop();
      }
    }
  };
  const timer = setInterval(() => void sweep(), 60_000);
  timer.unref?.();

  const available = async () => {
    if (
      !options.binary ||
      !options.home ||
      !isAbsolute(options.binary) ||
      !isAbsolute(options.home)
    )
      return false;
    const info = await lstat(options.binary).catch(() => null);
    return !!info?.isFile() && !info.isSymbolicLink();
  };
  const engineFor = async (owner: string): Promise<Engine> => {
    let pending = engines.get(owner);
    if (!pending) {
      await sweep();
      pending = engines.get(owner);
    }
    if (!pending) {
      if (engines.size >= MAX_ENGINES) throw new Error("Studio capacity reached");
      pending = (async () => {
        const identity = Bun.CryptoHasher.hash("sha256", owner, "hex");
        const home = join(options.home!, identity);
        await mkdir(home, { recursive: true, mode: 0o700 });
        const canonical = await realpath(home);
        const root = await realpath(options.home!);
        if (relative(root, canonical) !== identity) throw new Error("Invalid Studio home");
        const io = join(canonical, "io");
        for (const path of [io, join(io, "uploads"), join(io, "exports")]) {
          await mkdir(path, { recursive: true, mode: 0o700 });
          const info = await lstat(path);
          if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(path)) !== path)
            throw new Error("Invalid Studio IO directory");
        }
        const env = {
          PATH: process.env.PATH,
          SYSTEMROOT: process.env.SYSTEMROOT,
          HOME: canonical,
          USERPROFILE: canonical,
          APPDATA: join(canonical, "config"),
          LOCALAPPDATA: join(canonical, "cache"),
          XDG_CONFIG_HOME: join(canonical, "config"),
          XDG_DATA_HOME: join(canonical, "data"),
          XDG_CACHE_HOME: join(canonical, "cache"),
          SHENRON_HOME: canonical,
          TMPDIR: join(canonical, "tmp"),
          TEMP: join(canonical, "tmp"),
          TMP: join(canonical, "tmp"),
        };
        await mkdir(env.TMPDIR, { recursive: true, mode: 0o700 });
        const bridge = koharuBridge({
          binary: options.binary!,
          arguments: ["--root", join(canonical, "projects"), "--web-io-root", io],
          env,
          spawn: options.spawn,
        });
        return { bridge, io, touched: now() };
      })();
      engines.set(owner, pending);
      void pending.catch(() => {
        if (engines.get(owner) === pending) engines.delete(owner);
      });
    }
    const engine = await pending;
    engine.touched = now();
    return engine;
  };

  const relay = async (engine: Engine, request: Request, tail: string, body?: unknown) => {
    const url = new URL(`http://127.0.0.1${KOHARU_PATH}/${tail}${new URL(request.url).search}`);
    const headers = new Headers({
      "x-koharu-session": request.headers.get("x-koharu-session") ?? "",
      "content-type": "application/json",
    });
    const local = new Request(url.href, {
      method: request.method,
      headers,
      body: request.method === "POST" ? JSON.stringify(body) : undefined,
      signal: request.signal,
    });
    return (await engine.bridge.handle(local, url, "127.0.0.1"))!;
  };

  return {
    async handle(request: Request, owner: string | null) {
      const url = new URL(request.url);
      if (!owner) return json({ error: "Studio staff authentication required" }, 401);
      const origin = request.headers.get("origin");
      if (
        (origin && origin !== (options.origin ?? url.origin)) ||
        ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? "")
      )
        return json({ error: "Same-origin Studio request required" }, 403);
      if (!(await available())) return json({ available: false }, 503);
      const tail = url.pathname.slice("/api/studio/".length);
      if (tail === "health" && request.method === "GET") return json({ available: true });
      if (
        !(
          (tail === "events" && request.method === "GET") ||
          (["invoke", "import", "export"].includes(tail) && request.method === "POST")
        )
      )
        return json({ error: "Unknown Studio route" }, 404);
      const session =
        tail === "events"
          ? url.searchParams.get("session")
          : request.headers.get("x-koharu-session");
      if (!SESSION.test(session ?? "")) return json({ error: "Invalid Studio session" }, 400);
      let engine: Engine;
      try {
        engine = await engineFor(owner);
      } catch {
        return json({ error: "Studio capacity unavailable" }, 503);
      }
      if (tail === "events") return relay(engine, request, "events");
      if (tail === "import") {
        if (Number(request.headers.get("content-length")) > MAX_UPLOAD)
          return json({ error: "Upload too large" }, 413);
        const bytes = await boundedBytes(request, MAX_UPLOAD);
        if (!bytes) return json({ error: "Upload too large" }, 413);
        const form = await new Request(request.url, {
          method: "POST",
          headers: { "content-type": request.headers.get("content-type") ?? "" },
          body: bytes as Uint8Array<ArrayBuffer>,
        })
          .formData()
          .catch(() => null);
        const files = form?.getAll("files") ?? [];
        if (
          files.length === 0 ||
          files.length > MAX_FILES ||
          files.some(
            (file) => !(file instanceof File) || !EXTENSIONS.has(extname(file.name).toLowerCase()),
          )
        )
          return json({ error: "Invalid import files" }, 400);
        const paths: string[] = [];
        try {
          for (const entry of files) {
            const file = entry as File;
            const path = join(
              engine.io,
              "uploads",
              `${crypto.randomUUID()}${extname(file.name).toLowerCase()}`,
            );
            await Bun.write(path, file, { mode: 0o600 });
            paths.push(path);
          }
          return await relay(engine, request, "invoke", {
            command: "import",
            args: { source: "files", _webImport: paths },
          });
        } finally {
          await Promise.all(paths.map((path) => rm(path, { force: true })));
        }
      }
      const bytes = await boundedBytes(request, 8 * 1024 * 1024);
      if (!bytes) return json({ error: "Request too large" }, 413);
      let body: { command?: string; args?: Record<string, unknown>; format?: string };
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json({ error: "Invalid JSON" }, 400);
      if (tail === "invoke") {
        // Internal filesystem selections never come from the browser's command arguments.
        if (
          body.command === "import" ||
          body.command === "export" ||
          Object.keys(body.args ?? {}).some((key) => key.startsWith("_web"))
        )
          return json({ error: "Use Studio file transfer" }, 400);
        return relay(engine, request, "invoke", body);
      }
      if (!FORMATS.has(body.format ?? "")) return json({ error: "Invalid export format" }, 400);
      const destination = join(engine.io, "exports", crypto.randomUUID());
      const response = await relay(engine, request, "invoke", {
        command: "export",
        args: { format: body.format, _webExport: destination },
      });
      if (!response.ok) return response;
      try {
        if (body.format === "cbz") {
          const file = Bun.file(destination);
          if (file.size > 256 * 1024 * 1024) return json({ error: "Export too large" }, 413);
          return new Response(await file.arrayBuffer(), {
            headers: {
              ...PRIVATE,
              "content-type": "application/vnd.comicbook+zip",
              "content-disposition": 'attachment; filename="studio.cbz"',
            },
          });
        }
        const archive: Record<string, Blob> = {};
        let total = 0;
        for await (const path of new Bun.Glob("**/*").scan({
          cwd: destination,
          onlyFiles: true,
          followSymlinks: false,
        })) {
          const file = Bun.file(join(destination, path));
          total += file.size;
          if (total > 256 * 1024 * 1024 || Object.keys(archive).length >= 1000)
            return json({ error: "Export too large" }, 413);
          archive[path] = new Blob([await file.arrayBuffer()]);
        }
        return new Response(await new Bun.Archive(archive, { compress: "gzip" }).blob(), {
          headers: {
            ...PRIVATE,
            "content-type": "application/gzip",
            "content-disposition": `attachment; filename="studio-${body.format}.tar.gz"`,
          },
        });
      } finally {
        await rm(destination, { recursive: true, force: true });
      }
    },
    async stop() {
      clearInterval(timer);
      for (const pending of engines.values()) (await pending.catch(() => null))?.bridge.stop();
      engines.clear();
    },
  };
}

async function boundedBytes(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Bun.concatArrayBuffers(chunks));
}
