#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Stages a release with publish-downloads.ts, then ships it to the public releases directory of
 * a host and swaps it in with a rename, so `/download` never sees a half-written release:
 *
 *   bun scripts/release/ship-downloads.ts [--host dbfr] [--version X.Y.Z] <file|dir>...
 *
 * The site container mounts that directory read-only (deploy/docker/compose.yaml).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { publish } from "./publish-downloads";

const REMOTE = "/srv/shenron/shared/releases";
const SSH = ["-o", "ConnectTimeout=15", "-o", "BatchMode=yes"];

async function run(command: string[], timeoutMs: number, cwd?: string): Promise<void> {
  const child = Bun.spawn(command, { stdout: "inherit", stderr: "inherit", cwd });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  const code = await child.exited;
  clearTimeout(timer);
  if (code !== 0) throw new Error(`${command[0]} failed (exit ${code})`);
}

const args = process.argv.slice(2);
const take = (flag: string) => {
  const i = args.indexOf(flag);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const host = take("--host") ?? "dbfr";
const version =
  take("--version") ??
  (await Bun.file(resolve(import.meta.dir, "../../Cargo.toml")).text()).match(
    /\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
  )?.[1];
if (!version || args.length === 0)
  throw new Error(
    "Usage: bun scripts/release/ship-downloads.ts [--host h] [--version v] <file|dir>...",
  );

const stage = await mkdtemp(join(tmpdir(), "shenron-release-"));
try {
  await publish(
    stage,
    version,
    args.map((a) => resolve(a)),
  );
  const fresh = `${REMOTE}.new`;
  await run(
    ["ssh", ...SSH, host, `sudo rm -rf ${fresh} && sudo install -d -m 755 -o ubuntu ${fresh}`],
    60_000,
  );
  await run(["scp", "-q", "-r", ...SSH, ".", `${host}:${fresh}/`], 3_600_000, stage);
  // The site container bind-mounts REMOTE: update it in place (a directory swap would leave the
  // mount on the removed inode). Binaries first, the manifest last, so readers never see a gap.
  await run(
    [
      "ssh",
      ...SSH,
      host,
      `sudo chmod -R a+rX ${fresh} && sudo install -d -m 755 -o ubuntu ${REMOTE} && cd ${fresh} && for f in $(ls | grep -v -e '^latest.json$' -e '^SHA256SUMS$'); do sudo mv -f $f ${REMOTE}/$f; done && sudo mv -f SHA256SUMS ${REMOTE}/SHA256SUMS && sudo mv -f latest.json ${REMOTE}/latest.json && cd / && sudo rm -rf ${fresh} && cd ${REMOTE} && for f in $(ls | grep -v -e '^latest.json$' -e '^SHA256SUMS$'); do grep -q " ${"$"}f$" SHA256SUMS || sudo rm -f ${"$"}f; done`,
    ],
    300_000,
  );
  console.log(JSON.stringify({ host, version, remote: REMOTE }));
} finally {
  await rm(stage, { recursive: true, force: true });
}
