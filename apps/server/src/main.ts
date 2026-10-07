// SPDX-License-Identifier: Apache-2.0
/**
 * `shenron-server`: the Shenron front app (site, Koharu editor, studio, administration), the
 * Shenron API (wiki, RAG, chat, conversations, VFS, OCR, MCP) and the local APIs in one
 * autonomous binary.
 *
 *   shenron-server [serve] [--port N] [--host H]   serve the front app (default)
 *   shenron-server serve all                       front app + the sibling shenron-bot binary
 *   shenron-server paths | doctor | init | version | help
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SHENRON_FFI_FILE } from "@shenron/native/shenron";
import { closeShenronWorkerPool } from "@shenron/native/worker";

import {
  ensureDirectories,
  initEnvFile,
  loadEnvironment,
  resolvePaths,
  secretPresence,
} from "./config";
import { LLAMA_DAEMON_VERB } from "./chat-model";
import { libraryPath } from "./local-api";
import { extract } from "./payload";
import { serveSite } from "./site";
import { VERSION } from "./version";

export { VERSION } from "./version";

const HELP = `shenron-server ${VERSION} — Shenron (dragonballfr.com) en un binaire

Usage:
  shenron-server [serve] [--port N] [--host H]   front app (site, éditeur Koharu, studio, admin)
  shenron-server serve all                       front app + bot Discord (binaire shenron-bot voisin)
  shenron-server paths                           dossiers résolus (SHENRON_HOME)
  shenron-server doctor                          profil et présence des secrets (jamais leurs valeurs)
  shenron-server init                            crée config/shenron.env (privé) s'il n'existe pas
  shenron-server version

Environnement : SHENRON_HOME, SHENRON_PROFILE (production|desktop|public), SHENRON_ENV_FILE,
SHENRON_SERVER_BIN, PORT, HOSTNAME, SHENRON_SITE_DIR ; API : SHENRON_VFS_DB, SHENRON_CHAT_BACKENDS et
APHRODY_AI_CHAT_BASE_URL (modèle local), SHENRON_CHAT_MODEL (modèle géré du profil desktop), SHENRON_MCP_URL ou SHENRON_MCP_BIN, APHRODY_BIN (OCR),
SHENRON_KOHARU_SDK_BIN (moteur de l'éditeur, /api/local/koharu), SHENRON_LEXIQUE.
Le processus l'emporte sur config/shenron.env, puis sur les valeurs publiques par défaut
(dragonballfr.com). GET /api/local/health dit quels groupes de l'API répondent.`;

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function main(
  argv: string[],
  options: { embeddedPayload?: string } = {},
): Promise<void> {
  const startedAt = performance.now();
  const [command = "serve", ...rest] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }
  if (command === "version" || command === "--version" || command === "-v") {
    console.log(`shenron-server ${VERSION} (Bun ${Bun.version})`);
    return;
  }
  const paths = resolvePaths();
  if (command === LLAMA_DAEMON_VERB) {
    // The model supervisor of the local chat (./chat-model.ts) re-executes this server as its
    // daemon: Aphrody's daemon in the native library (`--library` from the parent, else the
    // usual resolution).
    const named = rest[0] === "--library" ? rest[1] : undefined;
    const library = named ?? libraryPath(paths, process.env);
    if (!library) {
      console.error("shenron-server llama-daemon : bibliothèque native absente (SHENRON_FFI_LIB)");
      process.exit(70);
    }
    const { shenronLoad, shenronLlamaDaemon } = await import("@shenron/native/shenron");
    shenronLoad(library);
    process.exit(shenronLlamaDaemon(named ? rest.slice(2) : rest));
  }
  if (command === "paths") {
    console.log(JSON.stringify(paths, null, 2));
    return;
  }
  if (command === "init") {
    ensureDirectories(paths);
    console.log(initEnvFile(paths) ? `créé : ${paths.envFile}` : `existe déjà : ${paths.envFile}`);
    return;
  }
  const { profile, fromFile } = loadEnvironment(paths);
  if (command === "doctor") {
    console.log(
      JSON.stringify(
        {
          version: VERSION,
          profile,
          home: paths.home,
          envFile: paths.envFile,
          fromFile,
          secrets: secretPresence(),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command !== "serve") {
    console.error(`commande inconnue : ${command}\n\n${HELP}`);
    process.exit(64);
  }
  ensureDirectories(paths);
  let payloadDir: string | undefined;
  if (options.embeddedPayload && !process.env.SHENRON_SITE_DIR) {
    const payload = await extract(options.embeddedPayload, paths.cache);
    payloadDir = payload.dir;
    process.env.SHENRON_SITE_DIR = join(payload.dir, "site");
    if (!process.env.SHENRON_FFI_LIB) {
      const lib = join(payload.dir, "native", SHENRON_FFI_FILE);
      if (existsSync(lib)) process.env.SHENRON_FFI_LIB = lib;
    }
    console.error(
      JSON.stringify({
        event: "shenron.payload",
        dir: payload.dir,
        extracted: payload.extracted,
        ms: payload.ms,
      }),
    );
  }
  const port = Number(option(rest, "--port") ?? process.env.PORT ?? 3000);
  const hostname = option(rest, "--host") ?? process.env.HOSTNAME ?? "127.0.0.1";
  const site = await serveSite(paths, { hostname, port, startedAt, payloadDir });
  let bot: ReturnType<typeof Bun.spawn> | undefined;
  if (rest[0] === "all") {
    const name = process.platform === "win32" ? "shenron-bot.exe" : "shenron-bot";
    const binary = join(paths.exeDir, name);
    if (!existsSync(binary)) throw new Error(`${name} introuvable à côté de shenron-server`);
    bot = Bun.spawn([binary], { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  }
  const stop = () => {
    site.stop();
    bot?.kill();
    // Cancel the native jobs in flight and stop the workers, then leave.
    void closeShenronWorkerPool().finally(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(`Shenron : ${site.url} (profil ${profile})`);
}
