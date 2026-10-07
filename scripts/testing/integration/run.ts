// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const root = join(import.meta.dir, "../../..");
const requested = new Set(process.argv.slice(2));
const onlyCross = requested.has("--cross-only");
const noBrowser = requested.has("--no-browser");
const stages: { name: string; cwd: string; args: string[] }[] = [];
if (!onlyCross) {
  // Each package retains its own mock/DOM isolation and live-test exclusions.
  for (const directory of ["packages", "apps"]) {
    for (const path of [
      ...new Bun.Glob("*/package.json").scanSync(join(root, directory)),
    ].toSorted()) {
      const manifest = await Bun.file(join(root, directory, path)).json();
      if (!manifest.scripts?.test) continue;
      stages.push({
        name: manifest.name,
        cwd: join(root, directory, path, ".."),
        args: ["run", "test"],
      });
    }
  }
}
stages.push({
  name: "shared shell palette DOM",
  cwd: join(root, "apps/site"),
  args: [
    "test",
    "--preload",
    Bun.resolveSync("@aphrody/bun-test-dom", join(root, "packages/ui")),
    "--isolate",
    "./tests/command-palette.dom.live.test.tsx",
  ],
});
stages.push({
  name: "Bun-native PostgreSQL theme",
  cwd: import.meta.dir,
  args: ["postgres.ts"],
});
stages.push({
  name: "cross-package HTTP contracts",
  cwd: import.meta.dir,
  args: ["test", "test/contracts.test.ts"],
});
if (!noBrowser)
  stages.push({
    name: "Obscura shared section navigation",
    cwd: import.meta.dir,
    args: ["test", "test/section-navigation.live.test.ts", "--timeout", "60000"],
  });
if (!noBrowser)
  stages.push({
    name: "Obscura real WebSocket transport",
    cwd: import.meta.dir,
    args: ["test", "test/websocket.live.test.ts", "--timeout", "30000"],
  });
if (!noBrowser)
  stages.push({
    name: "Obscura against Next dev and Bun host",
    cwd: import.meta.dir,
    args: ["test", "test/dev.live.test.ts", "--timeout", "180000"],
  });
const reportDirectory = join(root, "var/reports/integration");
mkdirSync(reportDirectory, { recursive: true });
const outcomes = [];
for (const stage of stages) {
  console.log(`\n[qualification] ${stage.name}`);
  const log = join(reportDirectory, `${stage.name.replace(/[^a-z0-9-]/gi, "-")}.log`);
  // FileSink overwrites from offset zero without truncating an older, longer report.
  await Bun.write(log, new Uint8Array());
  const sink = Bun.file(log).writer();
  const child = Bun.spawn([process.execPath, ...stage.args], {
    cwd: stage.cwd,
    env: { ...process.env, SHENRON_WEB_LIVE: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream) sink.write(chunk);
  };
  const output = Promise.all([drain(child.stdout), drain(child.stderr)]);
  const exitCode = await child.exited;
  await output;
  await sink.end();
  console.log(`[qualification] ${exitCode === 0 ? "PASS" : "FAIL"} — ${log}`);
  if (exitCode !== 0) console.log((await Bun.file(log).text()).split("\n").slice(-30).join("\n"));
  outcomes.push({ name: stage.name, exitCode, log });
  // Keep collecting independent package evidence even after a failed suite.
}
await Bun.write(
  join(root, "var/reports/integration/result.json"),
  JSON.stringify({ date: new Date().toISOString(), outcomes }, null, 2),
);
process.exitCode = outcomes.some((outcome) => outcome.exitCode !== 0) ? 1 : 0;
