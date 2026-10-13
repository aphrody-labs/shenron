import { expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileStoreDir } from "../../src/aphrody/a2a-file-store";

test("production uses the persistent application home when no coord override exists", () => {
  expect(fileStoreDir({ NODE_ENV: "production", SHENRON_HOME: "/var/lib/shenron" })).toBe(
    join("/var/lib/shenron", "data", "a2a", "shenron-dragonball"),
  );
  expect(fileStoreDir({ NODE_ENV: "production" })).toBeNull();
  expect(fileStoreDir({ NODE_ENV: "test", SHENRON_HOME: "/var/lib/shenron" })).toBeNull();
});

test("explicit durable store settings retain precedence over the application home", () => {
  expect(
    fileStoreDir({ NODE_ENV: "production", SHENRON_HOME: "/home", A2A_COORD_DIR: "/coord" }),
  ).toBe(join("/coord", "shenron-dragonball"));
  expect(
    fileStoreDir({
      NODE_ENV: "production",
      SHENRON_HOME: "/home",
      A2A_COORD_DIR: "/coord",
      SHENRON_A2A_STORE_DIR: "/explicit",
    }),
  ).toBe("/explicit");
});

test("production tasks survive a fresh process using only the application home", async () => {
  const home = await mkdtemp(join(tmpdir(), "shenron-a2a-home-"));
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", SHENRON_HOME: home };
  delete env.A2A_COORD_DIR;
  delete env.SHENRON_A2A_STORE_DIR;
  delete env.APHRODY_A2A_COORD_API;
  const modulePath = new URL("../../src/aphrody/a2a-file-store.ts", import.meta.url).href;
  const run = async (code: string) => {
    const process = Bun.spawn([Bun.which("bun")!, "-e", code], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    return stdout;
  };
  try {
    await run(
      `import { putFileTask } from ${JSON.stringify(modulePath)}; await putFileTask({ id: "task-persisted", createdAt: "2026-10-13T12:00:00Z", updatedAt: "2026-10-13T12:00:00Z" });`,
    );
    expect(
      await run(
        `import { listFileTasks } from ${JSON.stringify(modulePath)}; console.log(JSON.stringify(await listFileTasks()));`,
      ),
    ).toContain("task-persisted");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("production compose keeps the durable store inside its writable application volume", async () => {
  for (const [file, service] of [
    ["compose.yaml", "site"],
    ["compose.complete.yaml", "server"],
  ] as const) {
    const compose = Bun.YAML.parse(
      await Bun.file(new URL(`../../../../deploy/docker/${file}`, import.meta.url)).text(),
    ) as {
      services: Record<
        string,
        {
          environment: Record<string, string>;
          volumes: (string | { target: string; read_only?: boolean })[];
        }
      >;
    };
    const app = compose.services[service]!;
    expect(app.environment.A2A_COORD_DIR).toBe(`${app.environment.SHENRON_HOME}/data/a2a`);
    expect(
      app.volumes.some((volume) =>
        typeof volume === "string"
          ? volume.endsWith(":/var/lib/shenron")
          : volume.target === "/var/lib/shenron" && !volume.read_only,
      ),
    ).toBe(true);
  }
});
