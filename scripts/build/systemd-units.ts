// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const RELEASE_SERVICES = ["shenron-site", "shenron-bot", "shenron-mcp-http"] as const;

/** Read the already installed service definitions for an in-place production build. */
export async function readInstalledReleaseUnits(directory: string) {
  const units = new Map<string, string>();
  for (const service of RELEASE_SERVICES) {
    const path = join(directory, `${service}.service`);
    if (!(await stat(path)).isFile()) throw new Error(`${path} is not a regular service file`);
    const content = await readFile(path, "utf8");
    if (!/^WorkingDirectory=\/srv\/shenron\/current(?:\/\S*)?$/m.test(content))
      throw new Error(`${service}.service is not an installed /srv/shenron/current unit`);
    units.set(service, content);
  }
  return units;
}
