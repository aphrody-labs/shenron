// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHAT_ADAPTER, CHAT_BASE_MODEL } from "@shenron/config/chat-model";

import { planBackend } from "../src/backend";
import {
  downloadArtifact,
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

/** A fake `llama-server`: answers /health and /lora-adapters on --port, records its argv. */
function fakeLlama(dir: string, o: { exitAtOnce?: boolean } = {}): string {
  const path = join(dir, "llama", "llama-server");
  touch(
    path,
    o.exitAtOnce
      ? "#!/bin/sh\nexit 3\n"
      : `#!${process.execPath}
const args = process.argv.slice(2);
await Bun.write(${JSON.stringify(join(dir, "argv.json"))}, JSON.stringify(args));
const port = Number(args[args.indexOf("--port") + 1]);
const lora = args.includes("--lora");
Bun.serve({ hostname: "127.0.0.1", port, fetch(req) {
  const url = new URL(req.url);
  if (url.pathname === "/health") return Response.json({ status: "ok" });
  if (url.pathname === "/lora-adapters") return Response.json(lora ? [{ id: 0, scale: 1 }] : []);
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
    expect(plan.env.APHRODY_AI_CHAT_MODEL).toBe(CHAT_BASE_MODEL.id);
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
  test("starts llama-server with the adapter and reports it ready", async () => {
    const { dir, paths } = setup();
    const binary = fakeLlama(dir);
    const env = { SHENRON_PROFILE: "desktop", SHENRON_LLAMA_BIN: binary, ...noAphrody };
    touch(join(paths.home, "models", CHAT_BASE_MODEL.file));
    const adapter = touch(join(paths.exeDir, "models", CHAT_ADAPTER.file));
    const plan = planChatModel(paths, env)!;
    const model = startChatModel(plan, env);
    expect(model.status().available).toBe(false);
    expect(await model.ready).toBe(true);
    expect(model.status()).toEqual({
      available: true,
      reason: `${CHAT_BASE_MODEL.label} + ${CHAT_ADAPTER.id}`,
    });
    const argv = (await Bun.file(join(dir, "argv.json")).json()) as string[];
    expect(argv[argv.indexOf("--lora") + 1]).toBe(adapter);
    expect(argv[argv.indexOf("--model") + 1]).toBe(
      join(paths.home, "models", CHAT_BASE_MODEL.file),
    );
    expect(argv[argv.indexOf("--host") + 1]).toBe("127.0.0.1");
    model.stop();
  });

  test("base only when the adapter is off; failures are reported, never thrown", async () => {
    const { dir, paths } = setup();
    touch(join(paths.home, "models", CHAT_BASE_MODEL.file));
    const env = {
      SHENRON_PROFILE: "desktop",
      SHENRON_LLAMA_BIN: fakeLlama(dir),
      SHENRON_CHAT_LORA: "off",
      ...noAphrody,
    };
    const model = startChatModel(planChatModel(paths, env)!, env);
    expect(await model.ready).toBe(true);
    expect(model.status().reason).toContain("sans adaptateur");
    model.stop();

    const crash = setup();
    touch(join(crash.paths.home, "models", CHAT_BASE_MODEL.file));
    const crashing = { ...env, SHENRON_LLAMA_BIN: fakeLlama(crash.dir, { exitAtOnce: true }) };
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
