// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHAT_ADAPTER,
  CHAT_BASE_MODEL,
  CHAT_MODEL_IDS,
  GEMMA_MODEL,
} from "@shenron/config/chat-model";
import type { ShenronLlamaProvision, ShenronLlamaRouterStart } from "@shenron/native/shenron";

import { planBackend } from "../src/backend";
import {
  daemonLauncher,
  INSTALL_PATH,
  LLAMA_DAEMON_VERB,
  type LocalChatNative,
  planChatModel,
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

interface RouterModel {
  id: string;
  model: string;
  sha256?: string;
  lora: { spec: string; sha256?: string }[];
}

/**
 * The native local chat of shenron-ffi, faked: provisioning marks a spec present (after one
 * progress report), the router answers /health and /v1/chat/completions on the requested port
 * from the router.json it was given, a llama model being available once provisioned.
 */
function fakeNative(o: { llamaBin?: string | null; present?: string[]; failChat?: boolean } = {}) {
  const present = new Set(o.present ?? []);
  const provisions: ShenronLlamaProvision[] = [];
  const routers: { request: ShenronLlamaRouterStart; models: RouterModel[] }[] = [];
  const chats: { model: string }[] = [];
  let server: ReturnType<typeof Bun.serve> | null = null;
  const native: LocalChatNative = {
    async provision(request, onProgress) {
      provisions.push(request);
      onProgress({ role: "weights", spec: request.model!.spec, downloaded: 50, total: 100 });
      await Bun.sleep(5);
      present.add(request.model!.spec);
      return {
        modelId: request.model!.spec,
        weights: "/w.gguf",
        lora: (request.lora ?? []).map((l) => l.spec),
        transferred: true,
      };
    },
    startRouter(request) {
      void server?.stop(true);
      const config = JSON.parse(readFileSync(request.config, "utf8")) as {
        models: RouterModel[];
      };
      routers.push({ request, models: config.models });
      const port = Number(request.bind!.split(":")[1]);
      server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        async fetch(req) {
          const url = new URL(req.url);
          if (url.pathname === "/health")
            return Response.json({
              status: "ok",
              backends: config.models.map((m) => ({
                id: m.id,
                backend: "llama",
                available: present.has(m.model),
                running: false,
                reason: present.has(m.model) ? null : "model files not provisioned",
              })),
            });
          if (url.pathname === "/v1/chat/completions") {
            const body = (await req.json()) as { model: string };
            chats.push(body);
            if (o.failChat)
              return Response.json(
                { error: { message: "llama-server exited (code 3)" } },
                { status: 503 },
              );
            return Response.json({ choices: [{ message: { role: "assistant", content: "p" } }] });
          }
          return new Response("no", { status: 404 });
        },
      });
      const base = `http://127.0.0.1:${port}`;
      return {
        url: base,
        baseUrl: `${base}/v1`,
        healthUrl: `${base}/health`,
        models: config.models.map((m) => m.id),
        llamaBin: o.llamaBin === undefined ? "/opt/llama/llama-server" : o.llamaBin,
      };
    },
    stopRouter() {
      const had = server !== null;
      void server?.stop(true);
      server = null;
      return had;
    },
  };
  return { native, provisions, routers, chats };
}

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
    expect(desktop?.stateDir).toBe(join(paths.home, "llama"));
    // Opt-in outside the desktop profile.
    expect(planChatModel(paths, { SHENRON_CHAT_MODEL: "auto" })).not.toBe(null);
  });

  test("planBackend declares the local model URL of the router", () => {
    const { paths } = setup();
    const env = { SHENRON_PROFILE: "desktop" };
    const plan = planBackend(paths, env);
    expect(plan.env.APHRODY_LOCAL_MODEL_URL).toBe(plan.chatModel!.url);
    expect(plan.env.APHRODY_AI_CHAT_MODEL).toBe(CHAT_MODEL_IDS.shenron);
    expect(
      planBackend(paths, { ...env, APHRODY_AI_CHAT_MODEL: "own" }).env.APHRODY_AI_CHAT_MODEL,
    ).toBe("own");
    expect(planBackend(paths, {}).env.APHRODY_LOCAL_MODEL_URL).toBeUndefined();
  });

  test("the supervisor re-executes this server as its daemon", () => {
    expect(
      daemonLauncher(
        "/app/lib.so",
        "/app/shenron-server",
        ["/app/shenron-server"],
        "/$bunfs/root/x",
      ),
    ).toEqual({
      program: "/app/shenron-server",
      args: [LLAMA_DAEMON_VERB, "--library", "/app/lib.so"],
    });
    expect(
      daemonLauncher(null, "/usr/bin/bun", ["/usr/bin/bun", "/src/cli.ts", "serve"], "/src/cli.ts"),
    ).toEqual({ program: "/usr/bin/bun", args: ["/src/cli.ts", LLAMA_DAEMON_VERB] });
  });
});

describe("startChatModel", () => {
  test("router over both models, the default provisioned and warmed, Gemma installable", async () => {
    const { paths } = setup();
    const env = { SHENRON_PROFILE: "desktop", SHENRON_GEMMA_MODEL: "manual" };
    const adapter = touch(join(paths.exeDir, "models", CHAT_ADAPTER.file));
    const fake = fakeNative();
    const plan = planChatModel(paths, env)!;
    const model = startChatModel(plan, env, { native: fake.native });
    expect(model.status().available).toBe(false);
    expect(await model.ready).toBe(true);
    expect(model.status()).toEqual({
      available: true,
      reason: `${CHAT_BASE_MODEL.label} + ${CHAT_ADAPTER.id}`,
    });
    // router.json: catalog ids of aphrody-models, the shipped adapter used in place, digest pinned.
    const [router] = fake.routers;
    expect(router!.request.bind).toBe(`127.0.0.1:${plan.port}`);
    expect(router!.request.modelsDir).toBe(join(paths.home, "models"));
    expect(router!.request.searchDirs).toContain(paths.exeDir);
    expect(router!.request.daemon.args).toContain(LLAMA_DAEMON_VERB);
    expect(router!.models.map((m) => [m.id, m.model, m.lora])).toEqual([
      [
        CHAT_MODEL_IDS.shenron,
        CHAT_BASE_MODEL.id,
        [{ spec: `file:${adapter}`, sha256: CHAT_ADAPTER.sha256 }],
      ],
      [GEMMA_MODEL.id, GEMMA_MODEL.aphrodyId, []],
    ]);
    // Provisioned with the router's own request (its first start then finds everything there).
    expect(fake.provisions[0]).toMatchObject({
      modelsDir: join(paths.home, "models"),
      model: { spec: CHAT_BASE_MODEL.id },
      lora: [{ spec: `file:${adapter}` }],
    });
    expect(fake.chats.map((c) => c.model)).toEqual([CHAT_MODEL_IDS.shenron]);

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
    expect(await model.install(GEMMA_MODEL.id)).toBe(true);
    expect((await model.catalog()).find((e) => e.id === GEMMA_MODEL.id)?.state).toBe("ready");
    expect(model.status().reason).toContain(GEMMA_MODEL.id);
    // Gemma joined without a router restart.
    expect(fake.routers).toHaveLength(1);
    const list = await model.handle(
      new Request("http://127.0.0.1/api/local/models"),
      new URL("http://127.0.0.1/api/local/models"),
    );
    expect(((await list!.json()) as { models: unknown[] }).models).toHaveLength(2);
    model.stop();
  });

  test("files of an earlier release are used in place; gemma off leaves the list", async () => {
    const { paths } = setup();
    const base = touch(join(paths.home, "models", CHAT_BASE_MODEL.file));
    const gemma = touch(join(paths.home, "models", GEMMA_MODEL.file));
    const env = { SHENRON_PROFILE: "desktop", SHENRON_CHAT_LORA: "off" };
    const fake = fakeNative({ present: [`file:${gemma}`] });
    const model = startChatModel(planChatModel(paths, env)!, env, { native: fake.native });
    expect(await model.ready).toBe(true);
    expect(fake.routers[0]!.models.map((m) => [m.model, m.sha256])).toEqual([
      [`file:${base}`, CHAT_BASE_MODEL.sha256],
      [`file:${gemma}`, GEMMA_MODEL.sha256],
    ]);
    expect((await model.catalog()).find((e) => e.id === GEMMA_MODEL.id)?.state).toBe("ready");
    expect(model.status().reason).toContain("sans adaptateur");
    model.stop();

    const off = { ...env, SHENRON_GEMMA_MODEL: "off" };
    const without = startChatModel(planChatModel(setup().paths, off)!, off, {
      native: fakeNative().native,
    });
    expect((await without.catalog()).map((e) => e.id)).toEqual([CHAT_MODEL_IDS.shenron]);
    without.stop();
  });

  test("download progress is reported while provisioning", async () => {
    const { paths } = setup();
    const env = { SHENRON_PROFILE: "desktop", SHENRON_GEMMA_MODEL: "off" };
    const fake = fakeNative();
    const slow: LocalChatNative = {
      ...fake.native,
      async provision(request, onProgress, signal) {
        onProgress({ role: "weights", spec: request.model!.spec, downloaded: 25, total: 100 });
        await new Promise((resolve) => setTimeout(resolve, 60));
        return fake.native.provision(request, () => {}, signal);
      },
    };
    const model = startChatModel(planChatModel(paths, env)!, env, { native: slow });
    await Bun.sleep(20);
    expect(model.status()).toEqual({ available: false, reason: "téléchargement du modèle (25 %)" });
    expect((await model.catalog())[0]).toMatchObject({
      state: "downloading",
      progress: { received: 25, total: 100 },
    });
    expect(await model.ready).toBe(true);
    model.stop();
  });

  test("failures are reported, never thrown", async () => {
    const env = { SHENRON_PROFILE: "desktop", SHENRON_GEMMA_MODEL: "off" };
    const crashing = startChatModel(planChatModel(setup().paths, env)!, env, {
      native: fakeNative({ failChat: true }).native,
    });
    expect(await crashing.ready).toBe(false);
    expect(crashing.status()).toEqual({
      available: false,
      reason: "llama-server exited (code 3)",
    });
    crashing.stop();

    const absent = startChatModel(planChatModel(setup().paths, env)!, env, {
      native: fakeNative({ llamaBin: null }).native,
    });
    expect(await absent.ready).toBe(false);
    expect(absent.status().reason).toContain("llama-server absent");
    absent.stop();

    const noLibrary = startChatModel(planChatModel(setup().paths, env)!, env, { library: null });
    expect(await noLibrary.ready).toBe(false);
    expect(noLibrary.status().reason).toContain("bibliothèque native absente");
  });
});
