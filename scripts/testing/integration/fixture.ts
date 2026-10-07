// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalApi } from "@shenron/api/host";
import { ShenronVfs, writeWikiRows } from "@shenron/db/vfs";
import { serveFront } from "../../../apps/server/src/front";
import { localApi } from "../../../apps/server/src/local-api";
import { resolvePaths } from "../../../apps/server/src/config";

/** A real host and server, backed exclusively by temporary synthetic data. */
export function createFixture(nextPort = 0) {
  const root = mkdtempSync(join(tmpdir(), "shenron-qualification-"));
  const db = new Database(":memory:");
  const vfs = new ShenronVfs(db);
  vfs.setMeta("profile", "public");
  writeWikiRows(db, [
    {
      category: "characters",
      id: 1,
      slug: "son-goku",
      search: "son goku",
      data: { id: 1, name: "Son Goku", slug: "son-goku" },
    },
    {
      category: "characters",
      id: 2,
      slug: "vegeta",
      search: "vegeta",
      data: { id: 2, name: "Vegeta", slug: "vegeta" },
    },
  ]);
  const host = createLocalApi(
    {
      SHENRON_DATA_DIR: root,
      SHENRON_CHAT_STORE: join(root, "conversations.sqlite"),
      APHRODY_WORKSPACE: join(root, "agent"),
      APHRODY_BIN: join(root, "absent"),
      SHENRON_CHAT_TOOLS: "0",
      SHENRON_CHAT_BACKENDS: "local",
    },
    { vfsDatabase: db, betterAuth: null },
  );
  const front = serveFront({
    development: nextPort > 0,
    hostname: "127.0.0.1",
    port: 0,
    layout: { dist: join(root, "dist"), publicDir: join(root, "public") },
    local: localApi(
      resolvePaths({ SHENRON_HOME: root }),
      () => ({ site: nextPort > 0, groups: host.groups }),
      {},
    ),
    host,
    nextPort,
    ready: () => nextPort > 0,
  });
  return {
    host,
    front,
    root,
    url: `http://127.0.0.1:${front.port}`,
    async close() {
      await front.stop(true);
      await host.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
