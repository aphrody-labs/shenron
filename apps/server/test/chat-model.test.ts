// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHAT_ADAPTER,
  CHAT_BASE_MODEL,
  CHAT_MODEL_IDS,
  GEMMA_MODEL,
} from "@shenron/config/chat-model";

import { planBackend } from "../src/backend";
import {
  downloadArtifact,
  INSTALL_PATH,
  planChatModel,
  resolveLlamaServer,
  startChatModel,
} from "../src/chat-model";
import { testPaths } from "./support";

const root = mkdtempSync(join(tmpdir(), "shenron-chat-model-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let counter = 0;
function setup() {
  const dir = join(root, `case-${++counter}`);
  return { dir, paths: testPaths(dir) };
}

function touch(path: string, text = "x"): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
  return path;
}

const none = () => null;
/** A no-op Aphrody CLI: the store lookup finds nothing. */
const noAphrody = { APHRODY_BIN: "/nonexistent/aphrody" };

/**
 * A fake `llama-server` in router mode: reads its presets, answers /health, /v1/models,
 * /models/load and /lora-adapters on --port, and records its argv and presets.
 */
function fakeLlama(dir: string, o: { exitAtOnce?: boolean } = {}): string {
  const path = join(dir, "llama", "llama-server");
  touch(
    path,
    o.exitAtOnce
      ? "#!/bin/sh\nexit 3\n"
      : `#!${process.execPath}
const args = process.argv.slice(2);
const preset = await Bun.file(args[args.indexOf("--models-preset") + 1]).text();
await Bun.write(${JSON.stringify(join(dir, "argv.json"))}, JSON.stringify(args));
await Bun.write(${JSON.stringify(join(dir, "preset.ini"))}, preset);
const sections = [...preset.matchAll(/^\\[(.+)\\]\\n([^[]*)/gm)].map(([, id, body]) => ({ id, lora: /^lora = /m.test(body) }));
const loaded = new Set();
const port = Number(args[args.indexOf("--port") + 1]);
Bun.serve({ hostname: "127.0.0.1", port, async fetch(req) {
  const url = new URL(req.url);
  if (url.pathname === "/health") return Response.json({ status: "ok" });
  if (url.pathname === "/v1/models")
    return Response.json({ data: sections.map((s) => ({ id: s.id, status: { value: loaded.has(s.id) ? "loaded" : "unloaded" } })) });
  if (url.pathname === "/models/load") { loaded.add((await req.json()).model); return Response.json({ success: true }); }
  if (url.pathname === "/lora-adapters") {
    const s = sections.find((x) => x.id === url.searchParams.get("model"));
    return Response.json(s?.lora ? [{ id: 0, scale: 1 }] : []);
  }
  return new Response("no", { status: 404 });
} });
`,
  );
  chmodSync(path, 0o755);
  return path;
}

describe("resolveLlamaServer", () => {
  test("explicit file or directory, then shipped llama/, then PATH", () => {
    const { dir } = setup();
    expect(resolveLlamaServer(null, [dir], none)).toBe(null);
    expect(resolveLlamaServer(null, [dir], () => "/usr/bin/llama-server")).toBe(
      "/usr/bin/llama-server",
    );
    const shipped = touch(join(dir, "llama", "llama-server"));
    expect(resolveLlamaServer(null, [dir], none)).toBe(shipped);
    const own = touch(join(dir, "own", "bin", "llama-server"));
    expect(resolveLlamaServer(join(dir, "own"), [dir], none)).toBe(own);
    expect(resolveLlamaServer(own, [dir], none)).toBe(own);
    // An explicit path that does not exist falls back to the shipped one.
    expect(resolveLlamaServer(join(dir, "absent"), [dir], none)).toBe(shipped);
  });
});

describe("planChatModel", () => {
  test("on by default in the desktop profile only, off when the chat is external", () => {
    const { paths } = setup();
    expect(planChatModel(paths, {})).toBe(null);
    expect(planChatModel(paths, { SHENRON_PROFILE: "production" })).toBe(null);
    expect(planChatModel(paths, { SHENRON_PROFILE: "desktop", SHENRON_CHAT_MODEL: "off" })).toBe(
      null,
    );
    expect(
      planChatModel(paths, {
        SHENRON_PROFILE: "desktop",
        APHRODY_AI_CHAT_BASE_URL: "http://127.0.0.1:9/v1",
      }),
    ).toBe(null);
    const desktop = planChatModel(paths, { SHENRON_PROFILE: "desktop" });
    expect(desktop?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(desktop?.modelsDir).toBe(join(paths.home, "models"));
    // Opt-in outside the desktop profile.
    expect(planChatModel(paths, { SHENRON_CHAT_MODEL: "auto" })).not.toBe(null);
  });

  test("planBackend declares the local model URL when llama-server is shipped", () => {
    const { paths } = setup();
    const resources = join(paths.exeDir, "..", "resources");
    const env = { SHENRON_PROFILE: "desktop", SHENRON_RESOURCE_DIR: resources, PATH: "" };
    expect(planBackend(paths, env).env.APHRODY_LOCAL_MODEL_URL).toBeUndefined();
    touch(join(resources, "llama", "llama-server"));
    const plan = planBackend(paths, env);
    expect(plan.chatModel?.binary).toBe(join(resources, "llama", "llama-server"));
    expect(plan.env.APHRODY_LOCAL_MODEL_URL).toBe(plan.chatModel!.url);
    expect(plan.env.APHRODY_AI_CHAT_MODEL).toBe(CHAT_MODEL_IDS.shenron);
    expect(
      planBackend(paths, { ...env, APHRODY_AI_CHAT_MODEL: "own" }).env.APHRODY_AI_CHAT_MODEL,
    ).toBe("own");
  });
});

describe("downloadArtifact", () => {
  const body = new TextEncoder().encode("gguf-bytes-".repeat(100));
  const sha256 = new Bun.CryptoHasher("sha256").update(body).digest("hex");
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const range = request.headers.get("range")?.match(/^bytes=(\d+)-$/);
      if (range) {
        const start = Number(range[1]);
        return new Response(body.slice(start), {
          status: 206,
          headers: { "content-length": String(body.length - start) },
        });
      }
      return new Response(body, { headers: { "content-length": String(body.length) } });
    },
  });
  afterAll(() => server.stop(true));
  const url = `http://127.0.0.1:${server.port}/model.gguf`;

  test("downloads, resumes a partial file and checks the digest", async () => {
    const { dir } = setup();
    const dest = join(dir, "models", "a.gguf");
    const seen: number[] = [];
    await downloadArtifact(url, dest, { sha256, onProgress: (p) => seen.push(p.received) });
    expect(await Bun.file(dest).bytes()).toEqual(body);
    expect(seen.at(-1)).toBe(body.length);

    const resumed = join(dir, "models", "b.gguf");
    touch(`${resumed}.part`, new TextDecoder().decode(body.slice(0, 300)));
    await downloadArtifact(url, resumed, { sha256 });
    expect(await Bun.file(resumed).bytes()).toEqual(body);
    expect(existsSync(`${resumed}.part`)).toBe(false);

    const wrong = join(dir, "models", "c.gguf");
    expect(downloadArtifact(url, wrong, { sha256: "0".repeat(64) })).rejects.toThrow(/digest/);
  });
});

describe("startChatModel", () => {
  test("one router over the models on disk, the adapter applied, the catalog listed", async () => {
    const { dir, paths } = setup();
    const binary = fakeLlama(dir);
    const env = {
      SHENRON_PROFILE: "desktop",
      SHENRON_LLAMA_BIN: binary,
      SHENRON_GEMMA_MODEL: "manual",
      ...noAphrody,
    };
    const base = touch(join(paths.home, "models", CHAT_BASE_MODEL.file));
    const adapter = touch(join(paths.exeDir, "models", CHAT_ADAPTER.file));
    const model = startChatModel(planChatModel(paths, env)!, env);
    expect(model.status().available).toBe(false);
    expect(await model.ready).toBe(true);
    expect(model.status()).toEqual({
      available: true,
      reason: `${CHAT_BASE_MODEL.label} + ${CHAT_ADAPTER.id}`,
    });
    const argv = (await Bun.file(join(dir, "argv.json")).json()) as string[];
    expect(argv[argv.indexOf("--host") + 1]).toBe("127.0.0.1");
    expect(argv[argv.indexOf("--models-max") + 1]).toBe("1");
    const preset = await Bun.file(join(dir, "preset.ini")).text();
    expect(preset).toContain(`[${CHAT_MODEL_IDS.shenron}]\nmodel = ${base}\nlora = ${adapter}`);
    expect(preset).not.toContain(GEMMA_MODEL.id);

    const catalog = await model.catalog();
    expect(catalog.map((e) => [e.id, e.state, e.default, e.available])).toEqual([
      [CHAT_MODEL_IDS.shenron, "ready", true, true],
      [GEMMA_MODEL.id, "installable", false, false],
    ]);
    expect(catalog[1]!.installUrl).toBe(INSTALL_PATH(GEMMA_MODEL.id));
    // The install routes answer this machine only.
    const install = new URL(`http://127.0.0.1${INSTALL_PATH(GEMMA_MODEL.id)}`);
    const remote = await model.handle(
      new Request(install.href, { method: "POST" }),
      install,
      "10.0.0.2",
    );
    expect(remote?.status).toBe(403);
    const list = await model.handle(
      new Request("http://127.0.0.1/api/local/models"),
      new URL("http://127.0.0.1/api/local/models"),
    );
    expect(((await list!.json()) as { models: unknown[] }).models).toHaveLength(2);
    model.stop();
  });

  test("Gemma 4 E2B on disk joins the router; gemma off leaves the list", async () => {
    const { dir, paths } = setup();
    touch(join(paths.home, "models", CHAT_BASE_MODEL.file));
    const gemma = touch(join(paths.home, "models", GEMMA_MODEL.file));
    const env = {
      SHENRON_PROFILE: "desktop",
      SHENRON_LLAMA_BIN: fakeLlama(dir),
      SHENRON_CHAT_LORA: "off",
      ...noAphrody,
    };
    const model = startChatModel(planChatModel(paths, env)!, env);
    expect(await model.ready).toBe(true);
    expect(await Bun.file(join(dir, "preset.ini")).text()).toContain(
      `[${GEMMA_MODEL.id}]\nmodel = ${gemma}`,
    );
    expect((await model.catalog()).find((e) => e.id === GEMMA_MODEL.id)?.state).toBe("ready");
    expect(model.status().reason).toContain("sans adaptateur");
    model.stop();

    const off = { ...env, SHENRON_GEMMA_MODEL: "off" };
    const without = startChatModel(planChatModel(setup().paths, off)!, off);
    expect((await without.catalog()).map((e) => e.id)).toEqual([CHAT_MODEL_IDS.shenron]);
    without.stop();
  });

  test("failures are reported, never thrown", async () => {
    const crash = setup();
    touch(join(crash.paths.home, "models", CHAT_BASE_MODEL.file));
    const crashing = {
      SHENRON_PROFILE: "desktop",
      SHENRON_LLAMA_BIN: fakeLlama(crash.dir, { exitAtOnce: true }),
      SHENRON_GEMMA_MODEL: "off",
      ...noAphrody,
    };
    const failed = startChatModel(planChatModel(crash.paths, crashing)!, crashing);
    expect(await failed.ready).toBe(false);
    expect(failed.status()).toEqual({ available: false, reason: "llama-server arrêté (code 3)" });

    const missing = setup();
    const noBinary = { SHENRON_PROFILE: "desktop", PATH: "", ...noAphrody };
    const absent = startChatModel(planChatModel(missing.paths, noBinary)!, noBinary);
    expect(await absent.ready).toBe(false);
    expect(absent.status().reason).toContain("llama-server absent");
  });
});
