// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startNextStandalone, waitForNextStartup } from "../src/next-startup";

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
