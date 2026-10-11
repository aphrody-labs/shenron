// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readInstalledReleaseUnits, RELEASE_SERVICES } from "./systemd-units.ts";

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("installed release units", () => {
  test("loads all services that target the active Shenron release", async () => {
    directory = await mkdtemp(join(tmpdir(), "shenron-systemd-"));
    for (const service of RELEASE_SERVICES)
      await writeFile(
        join(directory, `${service}.service`),
        `[Service]\nWorkingDirectory=/srv/shenron/current/apps/${service}\n`,
      );

    expect([...(await readInstalledReleaseUnits(directory)).keys()]).toEqual([...RELEASE_SERVICES]);
  });

  test("rejects units that point outside the active Shenron release", async () => {
    directory = await mkdtemp(join(tmpdir(), "shenron-systemd-"));
    for (const service of RELEASE_SERVICES)
      await writeFile(
        join(directory, `${service}.service`),
        "[Service]\nWorkingDirectory=/srv/other/current\n",
      );

    await expect(readInstalledReleaseUnits(directory)).rejects.toThrow(
      "is not an installed /srv/shenron/current unit",
    );
  });
});
