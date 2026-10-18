// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStudioRuntime } from "../src/studio";
import type { EngineProcess } from "@aphrody/shenron-koharu/web-server";

const homes: string[] = [];
const runtimes: ReturnType<typeof createStudioRuntime>[] = [];
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.stop()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "shenron-studio-test-"));
  homes.push(home);
  const calls: {
    command: string[];
    env: Record<string, string | undefined>;
    requests: Record<string, unknown>[];
  }[] = [];
  const runtime = createStudioRuntime({
    binary: process.execPath,
    home,
    spawn: (command, env) => {
      const call = { command, env, requests: [] as Record<string, unknown>[] };
      calls.push(call);
      let controller: ReadableStreamDefaultController<Uint8Array>;
      let exit!: (code: number) => void;
      const stdout = new ReadableStream<Uint8Array>({
        start: (stream) => {
          controller = stream;
        },
      });
      return {
        stdout,
        exited: new Promise<number>((resolve) => {
          exit = resolve;
        }),
        kill: () => exit(0),
        stdin: {
          write: (line: string) => {
            const body = JSON.parse(line);
            call.requests.push(body);
            controller.enqueue(
              new TextEncoder().encode(
                `${JSON.stringify({ id: body.id, result: body.command === "get_project" ? { name: command[2] } : null })}\n`,
              ),
            );
          },
        },
      } satisfies EngineProcess;
    },
  });
  runtimes.push(runtime);
  return { runtime, calls, home };
}

function request(
  tail: string,
  body: unknown = { command: "get_project", args: {} },
  extra: Record<string, string> = {},
) {
  return new Request(`https://dragonballfr.com/api/studio/${tail}`, {
    method: "POST",
    headers: {
      "x-koharu-session": "session-0001",
      origin: "https://dragonballfr.com",
      "content-type": "application/json",
      ...extra,
    },
    body: JSON.stringify(body),
  });
}

test("authentication and same-origin checks precede all engine creation", async () => {
  const { runtime, calls } = await setup();
  expect((await runtime.handle(request("invoke"), null)).status).toBe(401);
  expect(
    (
      await runtime.handle(
        request("invoke", undefined, { origin: "https://other.example" }),
        "owner",
      )
    ).status,
  ).toBe(403);
  expect(
    (await runtime.handle(request("invoke", undefined, { "sec-fetch-site": "same-site" }), "owner"))
      .status,
  ).toBe(403);
  expect(calls).toHaveLength(0);
});

test("authenticated identities get distinct SDK roots and credential namespaces", async () => {
  const { runtime, calls } = await setup();
  expect((await runtime.handle(request("invoke"), "alice")).status).toBe(200);
  expect((await runtime.handle(request("invoke"), "bob")).status).toBe(200);
  expect(calls).toHaveLength(2);
  expect(calls[0]!.command[2]).not.toBe(calls[1]!.command[2]);
  expect(calls[0]!.command).toContain("--web-io-root");
  expect(calls[0]!.env.SHENRON_HOME).toContain(Bun.CryptoHasher.hash("sha256", "alice", "hex"));
  expect(calls[0]!.env.KOHARU_SECRET_NAMESPACE).toBe(
    Bun.CryptoHasher.hash("sha256", "alice", "hex"),
  );
  expect(calls[1]!.env.KOHARU_SECRET_NAMESPACE).toBe(Bun.CryptoHasher.hash("sha256", "bob", "hex"));
  expect(calls[0]!.env).not.toHaveProperty("DATABASE_URL");
  expect(calls[0]!.env).not.toHaveProperty("SHENRON_ADMIN_TOKEN");
  expect(calls[0]!.env).not.toHaveProperty("OPENAI_API_KEY");
});

test("browser commands cannot choose host import/export paths", async () => {
  const { runtime, calls } = await setup();
  for (const body of [
    { command: "import", args: { source: "folder" } },
    { command: "export", args: { format: "png" } },
    { command: "get_project", args: { _webImport: ["C:/protected/file.png"] } },
  ]) {
    expect((await runtime.handle(request("invoke", body), "alice")).status).toBe(400);
  }
  expect(calls).toHaveLength(0);
});

test("multipart images are staged under the owner and removed after SDK consumption", async () => {
  const { runtime, calls, home } = await setup();
  const form = new FormData();
  form.append(
    "files",
    new File([new Uint8Array([137, 80, 78, 71])], "../../page.png", { type: "image/png" }),
  );
  const response = await runtime.handle(
    new Request("https://dragonballfr.com/api/studio/import", {
      method: "POST",
      headers: { "x-koharu-session": "session-0001", origin: "https://dragonballfr.com" },
      body: form,
    }),
    "alice",
  );
  expect(response.status).toBe(200);
  const args = calls[0]!.requests[0]!.args as { _webImport: string[] };
  expect(args._webImport).toHaveLength(1);
  expect(args._webImport[0]).toContain(join("io", "uploads"));
  expect(args._webImport[0]).not.toContain("..");
  expect(
    await readdir(join(home, Bun.CryptoHasher.hash("sha256", "alice", "hex"), "io", "uploads")),
  ).toEqual([]);
});

test("invalid JSON is a bounded client error", async () => {
  const { runtime, calls } = await setup();
  const response = await runtime.handle(
    new Request("https://dragonballfr.com/api/studio/invoke", {
      method: "POST",
      headers: { "x-koharu-session": "session-0001" },
      body: "{",
    }),
    "alice",
  );
  expect(response.status).toBe(400);
  expect(calls).toHaveLength(0);
});
