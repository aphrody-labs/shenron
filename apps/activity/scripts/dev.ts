#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Development server: builds the client with the stand-in SDK, serves it with development
 * identities, and rebuilds when `client/` changes.
 *
 *   bun scripts/dev.ts [--port 5013]
 *
 * Open http://127.0.0.1:5013/?mock=1 : one window plays "Son Goku" against 3 simulated opponents.
 * `?mock=1&user=2` in another window plays the second character; see client/fake-sdk.ts for the
 * other parameters. Discord is never contacted. The bundle goes to `dist/dev`, never to `dist/client`.
 */
import { watch } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { startActivityServer } from "../src/server";
import { APP_ROOT, buildClient } from "./build";
import { startFakeBot } from "./fake-bot";

const args = Bun.argv.slice(2);
const portIndex = args.indexOf("--port");
const outdir = join(APP_ROOT, "dist", "dev");

await buildClient({ mock: true, minify: false, outdir });
// A stand-in for the bot's settlement endpoint, so a finished round shows its zeni.
const secret = process.env.SHENRON_ACTIVITY_SECRET ?? "dev-only-activity-secret-0123456789";
const token = process.env.SHENRON_ACTIVITY_TOKEN ?? "dev-only-activity-token";
const bot = startFakeBot({ secret, token });
const config = loadConfig({
  ...process.env,
  NODE_ENV: "development",
  SHENRON_ACTIVITY_SECRET: secret,
  SHENRON_ACTIVITY_TOKEN: token,
  SHENRON_BOT_API_URL: bot.url,
  SHENRON_ACTIVITY_DEV_AUTH: "1",
  SHENRON_ACTIVITY_HOST: "127.0.0.1",
  SHENRON_ACTIVITY_DIST: outdir,
  ...(portIndex >= 0 ? { SHENRON_ACTIVITY_PORT: args[portIndex + 1] } : {}),
});
const running = startActivityServer({ config });
console.log(`open ${running.url}/?mock=1`);

let timer: ReturnType<typeof setTimeout> | null = null;
let building = false;
watch(join(APP_ROOT, "client"), { recursive: true }, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (building) return;
    building = true;
    try {
      await buildClient({ mock: true, minify: false, outdir });
      console.log("client rebuilt: reload the page");
    } catch (error) {
      console.error((error as Error).message);
    } finally {
      building = false;
    }
  }, 150);
});

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await running.stop();
    await bot.stop();
    process.exit(0);
  });
