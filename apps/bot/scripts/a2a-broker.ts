#!/usr/bin/env bun
import { tempPath } from "@shenron/kit/paths";
/**
 * Bridge A2A Unix socket — lanceur du broker Rust `shenron a2a serve`
 * (crate shenron-a2a-coord, module legacy_broker). Même contrat que l'ancien
 * broker Bun : POST /jsonrpc (message/send, message/stream, tasks/list,
 * tasks/get, ping), GET /events (SSE, ping 30 s), socket 0666,
 * `.coord/messages.jsonl` et `.coord/tasks.json` réparé au démarrage.
 *
 * Lancement :
 *   bun scripts/a2a-broker.ts &
 *
 * Test côté client :
 *   curl --unix-socket /tmp/dbfr-a2a.sock -X POST http://localhost/jsonrpc \
 *     -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"ping"}'
 *
 * Variables : A2A_SOCKET, COORD_DIR, SHENRON_BIN (binaire shenron, défaut PATH).
 */

export const SOCKET = Bun.env.A2A_SOCKET ?? tempPath("dbfr-a2a.sock");
export const COORD_DIR =
  Bun.env.COORD_DIR ?? `${process.cwd().replace(/\/apps\/(shenron\/)?bot\/?$/, "")}/.coord`;

export function brokerArgs(socket: string = SOCKET, coordDir: string = COORD_DIR): string[] {
  return ["a2a", "serve", "--unix", socket, "--coord-dir", coordDir, "--no-tcp"];
}

if (import.meta.main) {
  const bin = Bun.env.SHENRON_BIN ?? "shenron";
  const child = Bun.spawn([bin, ...brokerArgs()], { stdio: ["inherit", "inherit", "inherit"] });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  process.exit(await child.exited);
}
