# Bun zero-dependency rules and native replacements (src)

## 1. Rules

1. No `bunx` (or `npx`) in scripts, `package.json`, `justfile`, CI workflows, code comments or docs: it resolves and runs npm tarballs on demand. Use `bun fmt`, `bun check`, `bun lint`, `bun test`, `bun build --compile`, `bun run <script>` or `bun <script.ts>`, or an installed binary from `~/.local/bin` (`ay`, `ai-os`, `wck`).
3. Never touch `%SystemRoot%\System32`; install built executables in `~/.local/bin`. Never print, log or commit `.env` secrets. No emoji.

## 2. `bun check` without npm type packages

`bun check` ships its own `lib.*.d.ts` (`ESNext`, `DOM`, `DOM.Iterable`). The shared ambient header is `packages/core/bun-native.d.ts`; include it from a package tsconfig (`"include": [..., "../core/bun-native.d.ts"]`, see `packages/ffi-bridge/tsconfig.json`) or reference it with a triple-slash path. Several packages also set `"types": ["bun"]` (`packages/core/tsconfig.json`, `packages/wck/tsconfig.json`). Copy the closest package's `package.json` and `tsconfig.json` instead of writing new ones.

## 3. Replacement table


| Legacy dependency | Bun replacement | Doc |
| --- | --- | --- |
| `bunx <pkg>` / `npx <pkg>` | `bun <cmd>`, `bun run <bin>`, binary in `~/.local/bin` | |
| `@types/bun`, `@types/node`, `typescript` | `bun check` + `packages/core/bun-native.d.ts` | `runtime/check.mdx` |
| prettier, biome | `bun fmt` / `bun fmt --check` | `format/index.mdx` |
| eslint, oxlint | `bun lint` (canary) | `bun lint --help` |
| `postgres`, `pg`, `mysql2` | `Bun.SQL` (`import { sql, SQL } from "bun"`) | `runtime/sql.mdx` |
| `better-sqlite3`, `sql.js` | `bun:sqlite` | `runtime/sqlite.mdx` |
| `aws4fetch`, AWS S3 SDK | `Bun.S3Client` / `Bun.s3` (`presign`, multipart `writer()`) | `runtime/s3.mdx` |
| `sharp`, `image-size`, `thumbhash` | `Bun.Image` / `Bun.file(p).image()` | `runtime/image.mdx` |
| `tar`, `archiver`, `fflate` | `Bun.Archive`, `Bun.gzipSync`, `Bun.deflateSync`, `Bun.zstdCompressSync` | `runtime/archive.mdx` |
| `express`, `fastify`, `hono`, `ws` | `Bun.serve({ routes, websocket })`, HTML imports, `HTMLRewriter` | `bundler/fullstack.mdx` |
| `undici`, `node-fetch`, `axios` | global `fetch` | |
| `uuid`, `nanoid`, `ulid`, `cuid2` | `Bun.randomUUIDv7()`, `crypto.randomUUID()` | `runtime/utils.mdx` |
| `bcrypt`, `argon2`, `xxhash-wasm` | `Bun.password`, `Bun.CryptoHasher`, `Bun.hash.*` | `runtime/hashing.mdx` |
| `glob`, `fast-glob`, `minimatch` | `new Bun.Glob(pattern)` | `runtime/glob.mdx` |
| `chalk`, `kleur`, `picocolors` | `Bun.color(c, "ansi")` | `runtime/color.mdx` |
| `yaml`, `js-yaml`, `@iarna/toml`, `json5` | `Bun.YAML`, `Bun.TOML`, `Bun.JSON5`, `Bun.JSONL` | |
| `esbuild`, `swc`, `tsup`, `pkg` | `Bun.Transpiler`, `Bun.build()`, `bun build --compile --bytecode` | `runtime/transpiler.mdx`, `compiler/bytecode.mdx` |
| `ffi-napi`, `koffi`, node-gyp addons | `bun:ffi` (`dlopen`, `FFIType`, `CString`, `ptr`) | `runtime/ffi.mdx`; first-party bridge: `packages/ffi-bridge`, `packages/core/src/ffi.ts` |

## 4. Idioms

```ts
import { SQL, S3Client } from "bun";
import { Database } from "bun:sqlite";

const pg = new SQL({ url: Bun.env.DATABASE_URL, max: 20 });
const rows = await pg`SELECT id, slug FROM episodes WHERE season = ${1}`;

using local = new Database("cache.sqlite", { create: true, strict: true });
local.exec("PRAGMA journal_mode = WAL");

const r2 = new S3Client({
  accessKeyId: Bun.env.R2_ACCESS_KEY_ID,
  secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
  bucket: "media-cdn",
  endpoint: `https://${Bun.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});
const url = r2.presign("videos/ep01.mp4", { expiresIn: 3600 }); // local SigV4, no network

const img = Bun.file("hero.png").image();
await img.resize(1280, 720, { fit: "inside" }).webp({ quality: 82 }).write("hero.webp");
```

Fullstack server with an HTML import, compiled to one executable:

```ts
import homepage from "./index.html";
Bun.serve({ routes: { "/": homepage, "/api/items/:id": { GET: (req) => Response.json({ id: req.params.id }) } } });
```

```sh
bun build --compile --minify --bytecode ./src/server.ts --outfile ~/.local/bin/my-service
```

Check method names against the docs above before relying on them (https://bun.com/docs).

## 5. Verification

```sh
rg -n "\bbunx\b" package.json justfile packages -g "!**/node_modules/**"   # expect no command invocation
bun fmt --check
bun check
bun test packages/<name>      # never bare `bun test` at the root
```
