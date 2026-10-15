// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const entry = join(import.meta.dir, "prepare-soshuhen-kanzenshuu-ingest.ts");
const reports = join(import.meta.dir, "../../var/reports/sosh-preparation-alias-20261015");
async function run(args: string[]) {
  const child = Bun.spawn([process.execPath, entry, ...args], {
    env: { ...process.env, DATABASE_URL: undefined },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

test("apply is refused before delegation even with dry-run or help", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      requests++;
      return Response.json({ catalog: [] });
    },
  });
  try {
    for (const flags of [
      ["--apply"],
      ["--apply=true"],
      ["--dry-run", "--apply"],
      ["--help", "--apply"],
    ]) {
      const result = await run([...flags, "--origin", server.url.origin]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("--apply est refusé");
      expect(result.stdout).toBe("");
    }
    expect(requests).toBe(0);
    expect((await run(["--help", "--origin", server.url.origin])).code).toBe(0);
    expect(requests).toBe(0);
  } finally {
    await server.stop(true);
  }
});

test("legacy dry-run delegates the real canonical audit and preserves its incomplete exit", async () => {
  const paths: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      paths.push(new URL(request.url).pathname);
      return Response.json({ catalog: [] });
    },
  });
  const output = join(reports, `test-${crypto.randomUUID()}.json`);
  try {
    await mkdir(reports, { recursive: true });
    const result = await run(["--dry-run", "--origin", server.url.origin, "--out", output]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(paths).toEqual(["/api/manga"]);
    const report = await Bun.file(output).json();
    expect(report.scope).toBe("public-catalogue-chapter-api-and-image-head-availability");
    expect(report.complete).toBe(false);
    expect(report.missingVolumes).toContain(1);
    expect(report.volumes).toEqual([]);
    expect(JSON.parse(result.stdout).output).toBe(output);
  } finally {
    await server.stop(true);
    await rm(output, { force: true });
  }
});
