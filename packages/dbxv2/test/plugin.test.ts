import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DBXV2_DECLARATIONS_FILE,
  DBXV2_MARKER,
  Dbxv2BuildRefusedError,
  dbxv2Plugin,
  findDbxv2Leaks,
  generateModuleSource,
  parseSpecifier,
  renderDeclarations,
  resetDbxv2Runtime,
  writeDeclarations,
} from "../src";
import { patterned, startFakeServer, TOKEN, type FakeServer } from "./fake-server";

let server: FakeServer;
let dir: string;
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  server = startFakeServer([
    { cpk: "CHARA", path: "a/one.emb", bytes: patterned(32) },
    { cpk: "CHARA", path: "a/model.emd", bytes: patterned(16) },
    { cpk: "CHARA", path: "raw.bin", bytes: patterned(40) },
  ]);
  dir = mkdtempSync(join(tmpdir(), "dbxv2-plugin-"));
  for (const key of ["DBXV2_SERVER_URL", "DBXV2_TOKEN"]) saved[key] = process.env[key];
});
afterAll(() => {
  resetDbxv2Runtime();
  server.stop();
  rmSync(dir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("specifier parsing", () => {
  test("format, ref and parameters", () => {
    expect(parseSpecifier("dbxv2:CHARA/a/one.emb?png&index=3")).toEqual({
      ref: { cpk: "CHARA", path: "a/one.emb" },
      format: "png",
      params: { index: 3, cue: undefined, emb: undefined, esk: undefined },
    });
    expect(parseSpecifier("dbxv2:CHARA/x.emd?glb").format).toBe("glb");
    expect(() => parseSpecifier("dbxv2:CHARA/x.emd")).toThrow(/exactly one format/);
    expect(() => parseSpecifier("dbxv2:CHARA/x.emd?png&wav")).toThrow(/exactly one format/);
    expect(() => parseSpecifier("dbxv2:CHARA/x?png&index=-1")).toThrow(/index/);
  });

  test("generated modules carry the marker and no token, URL or data", () => {
    const source = generateModuleSource(parseSpecifier("dbxv2:CHARA/a/one.emb?png"));
    expect(source).toContain(DBXV2_MARKER);
    expect(source).not.toContain(TOKEN);
    expect(source).not.toContain("http");
  });
});

describe("runtime plugin (Bun.plugin in a subprocess)", () => {
  const run = async (script: string, env: Record<string, string>) => {
    const file = join(dir, `run-${Math.random().toString(36).slice(2)}.ts`);
    writeFileSync(file, script);
    const preload = join(import.meta.dir, "../src/preload.ts");
    const proc = Bun.spawn([process.execPath, "--preload", preload, file], {
      cwd: dir,
      env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { out, err, code };
  };

  test("png URL, blob and model resolve through the signing proxy", async () => {
    const result = await run(
      `
      import url, { blob, ref } from "dbxv2:CHARA/a/one.emb?png";
      import model, { glbUrl } from "dbxv2:CHARA/a/model.emd?model";
      import bytes from "dbxv2:CHARA/raw.bin?raw";
      const res = await fetch(url);
      const b = await blob();
      console.log(JSON.stringify({
        ref, status: res.status, type: res.headers.get("content-type"), blob: b.type,
        prims: model.primitives.length, glb: glbUrl.includes("/r/model.glb/"), raw: bytes.byteLength,
        leak: url.includes(${JSON.stringify(TOKEN)}),
      }));
      process.exit(0);
      `,
      { DBXV2_SERVER_URL: server.url, DBXV2_TOKEN: TOKEN },
    );
    expect(result.err).not.toContain(TOKEN);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out.trim().split("\n").at(-1)!)).toEqual({
      ref: { cpk: "CHARA", path: "a/one.emb" },
      status: 200,
      type: "image/png",
      blob: "image/png",
      prims: 1,
      glb: true,
      raw: 40,
      leak: false,
    });
  });

  test("fails with a readable message when DBXV2 is disabled", async () => {
    const result = await run(`await import("dbxv2:CHARA/a/one.emb?png");`, {});
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("DBXV2_SERVER_URL is not set");
    expect(result.err).toContain("DBXV2_TOKEN");
  });

  test("fails when the token is missing", async () => {
    const result = await run(`await import("dbxv2:CHARA/a/one.emb?png");`, {
      DBXV2_SERVER_URL: server.url,
    });
    expect(result.code).not.toBe(0);
    expect(result.err).toContain("DBXV2_TOKEN is not set");
  });
});

describe("Bun.build", () => {
  const entry = (name: string): string => {
    const folder = join(dir, name);
    mkdirSync(folder, { recursive: true });
    const file = join(folder, "index.ts");
    writeFileSync(file, `import url from "dbxv2:CHARA/a/one.emb?png";\nconsole.log(url);\n`);
    return file;
  };

  test("a development build bundles thin wrappers only", async () => {
    const outdir = join(dir, "dev-out");
    const result = await Bun.build({
      entrypoints: [entry("dev")],
      outdir,
      target: "bun",
      plugins: [dbxv2Plugin({ env: {} })],
    });
    expect(result.success).toBe(true);
    const text = readdirSync(outdir)
      .map((f) => readFileSync(join(outdir, f), "utf8"))
      .join("\n");
    expect(text).toContain(DBXV2_MARKER);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(server.url);
    expect(findDbxv2Leaks(outdir)).toEqual(["index.js"]);
  });

  test.each([
    ["production env", { NODE_ENV: "production" }, {}],
    ["public profile", { SHENRON_PROFILE: "public" }, {}],
    ["public build flag", { SHENRON_PUBLIC_BUILD: "1" }, {}],
    ["minified build", {}, { minify: true }],
  ])("refused: %s", async (_label, env, extra) => {
    const attempt = (async () =>
      Bun.build({
        entrypoints: [entry("refused")],
        outdir: join(dir, "refused-out"),
        target: "bun",
        plugins: [dbxv2Plugin({ env })],
        ...extra,
      }))();
    let message = "";
    try {
      await attempt;
    } catch (error) {
      message =
        error instanceof AggregateError ? error.errors.map(String).join("\n") : String(error);
    }
    expect(message).toContain("refused");
    expect(readdirSyncSafe(join(dir, "refused-out"))).toEqual([]);
    expect(new Dbxv2BuildRefusedError("x").kind).toBe("build_refused");
  });
});

function readdirSyncSafe(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

describe("declarations", () => {
  const refs = [
    { cpk: "CHARA", path: "a/one.emb" },
    { cpk: "CHARA", path: "a/model.emd" },
    { cpk: "BGM", path: "theme.acb" },
    { cpk: "BGM", path: "clip.usm" },
  ];

  test("ambient modules per format and unions of known paths", () => {
    const text = renderDeclarations(refs);
    for (const format of ["png", "wav", "video", "glb", "model", "raw"])
      expect(text).toContain(`declare module "dbxv2:*?${format}"`);
    expect(text).toContain(`type Dbxv2KnownImage =\n  | "CHARA/a/one.emb";`);
    expect(text).toContain(`"BGM/theme.acb"`);
    expect(text).toContain(DBXV2_MARKER);
  });

  test("a large index degrades to template literal types", () => {
    expect(renderDeclarations(refs, { maxLiteralPaths: 1 })).toContain("`${string}/${string}`");
  });

  test("written under var/ only", () => {
    const content = renderDeclarations(refs);
    expect(() =>
      writeDeclarations(join(dir, "elsewhere", DBXV2_DECLARATIONS_FILE), content),
    ).toThrow(/var\//);
    const target = writeDeclarations(join(dir, "var", "dbxv2", DBXV2_DECLARATIONS_FILE), content);
    expect(readFileSync(target, "utf8")).toBe(content);
    expect(findDbxv2Leaks(join(dir, "var"))).toEqual([`dbxv2/${DBXV2_DECLARATIONS_FILE}`]);
  });

  test("the guard scans wasm and binary assets for the marker and private references", () => {
    const folder = join(dir, "public-bin");
    mkdirSync(join(folder, "wasm"), { recursive: true });
    const wasm = (extra: string) =>
      Buffer.concat([Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), Buffer.from(extra, "latin1")]);
    writeFileSync(join(folder, "wasm", "clean.wasm"), wasm("neutral names only"));
    writeFileSync(join(folder, "wasm", "marked.wasm"), wasm(`x${DBXV2_MARKER}y`));
    writeFileSync(join(folder, "wasm", "relay.wasm"), wasm("/admin/dbxv2/media/CHARA"));
    writeFileSync(join(folder, "tex.png"), Buffer.from(`PNG${DBXV2_MARKER}`, "latin1"));
    writeFileSync(join(folder, "ok.png"), Buffer.from("PNG clean", "latin1"));
    expect(findDbxv2Leaks(folder).toSorted()).toEqual([
      "tex.png",
      "wasm/marked.wasm",
      "wasm/relay.wasm",
    ]);
  });

  test("the generated declarations type-check a consumer", async () => {
    const folder = join(dir, "tc");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "dbxv2.d.ts"), renderDeclarations(refs));
    writeFileSync(
      join(folder, "use.ts"),
      `import url, { blob } from "dbxv2:CHARA/a/one.emb?png";
const s: string = url;
const b: Promise<Blob> = blob();
const p: Dbxv2KnownPath = "CHARA/a/one.emb";
void s; void b; void p;
`,
    );
    const matched = readFileSync(join(folder, "dbxv2.d.ts"), "utf8");
    expect(matched).toContain("export default url;");
  });
});
