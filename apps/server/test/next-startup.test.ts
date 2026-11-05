// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveNextRuntime,
  startNextStandalone,
  stopStandaloneChild,
  waitForNextStartup,
} from "../src/next-startup";

async function serverFixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), "shenron-lifecycle-"));
  const app = join(root, "site", "apps", "site");
  mkdirSync(join(app, ".next"), { recursive: true });
  await Bun.write(join(app, ".next", "BUILD_ID"), "synthetic-lifecycle");
  await Bun.write(join(app, "server.js"), source);
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "../src/cli.ts"), "serve", "--port", "0"],
    {
      env: {
        HOME: root,
        PATH: join(root, "no-tools"),
        SHENRON_HOME: join(root, "home"),
        SHENRON_SITE_DIR: join(root, "site"),
        SHENRON_PROFILE: "public",
        SHENRON_CHAT_STORE: "off",
        SHENRON_CHAT_BACKENDS: "local",
        SHENRON_MEMORY_ENABLED: "0",
        QUALIFICATION_MARKER: join(root, "stopped"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return { root, child };
}

test("the actual CLI exits with failure when its ready UI child crashes", async () => {
  const { root, child } = await serverFixture(`
    const relay = await fetch(process.env.SHENRON_HOST_URL + "/api/local/health");
    console.log(JSON.stringify({relayHost:process.env.SHENRON_HOST_URL,relayStatus:relay.status}));
    Bun.serve({hostname:process.env.HOSTNAME,port:Number(process.env.PORT),fetch:()=>new Response("ready")});
    setTimeout(()=>process.exit(7),1000);
  `);
  try {
    const stderr = new Response(child.stderr).text();
    const stdout = new Response(child.stdout).text();
    expect(await child.exited).toBe(1);
    const output = await stdout;
    expect(output).toContain("Shenron : http://");
    expect(output).toMatch(/"relayHost":"http:\/\/127\.0\.0\.1:\d+","relayStatus":503/);
    const events = await stderr;
    expect(events).toContain('"event":"shenron.site.ready"');
    expect(events).toContain('"event":"shenron.site.exited","exitCode":7');
  } finally {
    await stopStandaloneChild(child, 100);
    rmSync(root, { recursive: true, force: true });
  }
}, 15_000);

test.skipIf(process.platform === "win32")(
  "the CLI waits for graceful child cleanup before leaving",
  async () => {
    const { root, child } = await serverFixture(`
    process.on("SIGTERM",async()=>{await Bun.sleep(100);await Bun.write(process.env.QUALIFICATION_MARKER,"closed");process.exit(0)});
    Bun.serve({hostname:process.env.HOSTNAME,port:Number(process.env.PORT),fetch:()=>new Response("ready")});
  `);
    const stderr = new Response(child.stderr).text();
    try {
      const reader = child.stdout.getReader();
      let output = "";
      while (!output.includes("Shenron : http://")) {
        const part = await reader.read();
        if (part.done) throw new Error("CLI exited before readiness");
        output += new TextDecoder().decode(part.value);
      }
      reader.releaseLock();
      await stopStandaloneChild(child);
      expect(child.exitCode).toBe(0);
      expect(existsSync(join(root, "stopped"))).toBe(true);
      expect(await stderr).not.toContain('"event":"shenron.site.exited"');
    } finally {
      await stopStandaloneChild(child, 100);
      rmSync(root, { recursive: true, force: true });
    }
  },
  15_000,
);

test("the actual standalone launcher starts a loopback Bun child with production routing", async () => {
  const app = mkdtempSync(join(tmpdir(), "shenron-startup-"));
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reservation.port!;
  await reservation.stop(true);
  let child: Awaited<ReturnType<typeof startNextStandalone>> | undefined;
  try {
    await Bun.write(
      join(app, "server.js"),
      `Bun.serve({hostname:process.env.HOSTNAME,port:Number(process.env.PORT),fetch:()=>Response.json({runtime:typeof Bun,mode:process.env.NODE_ENV,marker:process.env.QUALIFICATION_MARKER})})`,
    );
    child = await startNextStandalone(
      app,
      port,
      {
        QUALIFICATION_MARKER: "synthetic-startup",
        NODE_ENV: "development",
        HOSTNAME: "0.0.0.0",
      },
      { timeoutMs: 2_000 },
    );
    expect(await (await fetch(`http://127.0.0.1:${port}/robots.txt`)).json()).toEqual({
      runtime: "object",
      mode: "production",
      marker: "synthetic-startup",
    });
    expect(child.exitCode).toBeNull();
  } finally {
    if (child) await stopChild(child);
    rmSync(app, { recursive: true, force: true });
  }
});

function sleepingChild(source = "await Bun.sleep(60_000)") {
  return Bun.spawn([process.execPath, "-e", source], { stdio: ["ignore", "pipe", "ignore"] });
}

async function stopChild(child: ReturnType<typeof sleepingChild>) {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await child.exited;
}

test("a responding standalone server retains its live child", async () => {
  const child = sleepingChild();
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ready") });
  try {
    await waitForNextStartup(child, server.port!, { timeoutMs: 2_000 });
    expect(child.exitCode).toBeNull();
  } finally {
    await stopChild(child);
    await server.stop(true);
  }
});

test("a hanging HTTP probe reaches its deadline and joins the child", async () => {
  const child = sleepingChild();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Promise<Response>(() => {}),
  });
  try {
    await expect(waitForNextStartup(child, server.port!, { timeoutMs: 100 })).rejects.toThrow(
      "did not start within 0.1 s",
    );
    expect(child.signalCode !== null || child.exitCode !== null).toBe(true);
  } finally {
    await stopChild(child);
    await server.stop(true);
  }
});

test("ready headers do not wait for an unfinished response body", async () => {
  const child = sleepingChild();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(65_536));
          },
        }),
      ),
  });
  try {
    await waitForNextStartup(child, server.port!, { timeoutMs: 2_000 });
    expect(child.exitCode).toBeNull();
    expect(child.signalCode).toBeNull();
  } finally {
    await stopChild(child);
    await server.stop(true);
  }
});

test("a child exit interrupts a hanging readiness request", async () => {
  const child = sleepingChild("await Bun.sleep(100);process.exit(7)");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Promise<Response>(() => {}),
  });
  try {
    await expect(waitForNextStartup(child, server.port!, { timeoutMs: 10_000 })).rejects.toThrow(
      "exited with 7",
    );
    expect(child.exitCode).toBe(7);
  } finally {
    await stopChild(child);
    await server.stop(true);
  }
});

test.skipIf(process.platform === "win32")(
  "a child that ignores SIGTERM is killed and joined on startup failure",
  async () => {
    const child = sleepingChild(
      "process.on('SIGTERM',()=>{});console.log('ready');await Bun.sleep(60_000)",
    );
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(null, { status: 503 }),
    });
    try {
      const reader = child.stdout.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain("ready");
      reader.releaseLock();
      await expect(
        waitForNextStartup(child, server.port!, {
          timeoutMs: 300,
          shutdownGraceMs: 50,
        }),
      ).rejects.toThrow("did not start within 0.3 s");
      expect(child.signalCode).toBe("SIGKILL");
    } finally {
      await stopChild(child);
      await server.stop(true);
    }
  },
);

test("the Next child runs under the Bun shipped beside an AOT executable", () => {
  const exists = (path: string) => path === "/srv/shenron/runtime/bun";
  const base = { compiled: true, execPath: "/srv/shenron/shenron-server", env: {}, exists };
  expect(resolveNextRuntime(base)).toEqual({ program: "/srv/shenron/runtime/bun", beBun: false });
  // No runtime shipped: the bytecode executable is its own Bun.
  expect(resolveNextRuntime({ ...base, exists: () => false })).toEqual({
    program: "/srv/shenron/shenron-server",
    beBun: true,
  });
  // A source run uses the Bun running it, whatever sits next to it.
  expect(resolveNextRuntime({ ...base, compiled: false })).toEqual({
    program: "/srv/shenron/shenron-server",
    beBun: false,
  });
  expect(resolveNextRuntime({ ...base, env: { SHENRON_NEXT_BUN: "/opt/bun/bin/bun" } })).toEqual({
    program: "/opt/bun/bin/bun",
    beBun: false,
  });
  expect(
    resolveNextRuntime({
      compiled: true,
      platform: "win32",
      execPath: "C:\shenron\shenron-server.exe",
      env: {},
      exists: (path) => path.endsWith("bun.exe"),
    }).beBun,
  ).toBe(false);
});
