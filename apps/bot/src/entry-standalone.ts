if (process.argv.includes("--replica-sync")) {
  // Reuse the canonical wiki-only writer without starting migrations, services or Discord.
  const { runReplicaSync } = await import("./db/replica-cli");
  process.exit(
    await runReplicaSync(process.argv.slice(2).filter((arg) => arg !== "--replica-sync")),
  );
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Shenron Discord Bot + Public API`);
  console.log(`Usage: shenron [options]\n`);
  console.log(`Options:`);
  console.log(`  -h, --help     Show this help message`);
  console.log(`  -v, --version  Show version and runtime info`);
  console.log(`  --dry-run      Validate environment and exit without services or Discord login`);
  console.log(`  --replica-sync Run the canonical PostgreSQL-to-SQLite wiki replica CLI (--help)`);
  console.log(
    `  --smoke        Render a native PNG and load commands/events without databases or Discord`,
  );
  process.exit(0);
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  // Runtime info from the kit: interpreted source or compiled binary, Bun version, platform.
  const { getBotRuntimeInfo } = await import("@aphrody/discord-kit");
  const info = getBotRuntimeInfo();
  console.log(
    `@aphrody/shenron-bot v1.0.0 (Bun ${info.bunVersion}, ${info.platform}-${info.arch}, ${info.isCompiled ? "compiled" : "source"})`,
  );
  process.exit(0);
}

if (process.argv.includes("--smoke")) {
  // Smoke check of the binary: load the whole command and event graph (every @Discord class)
  // and build discordx's metadata, with no database, migration, service or Discord login.
  // Required identifiers missing from the environment get inert fixture values (never a
  // credential: no token here can authenticate anywhere).
  const fixture: Record<string, string> = {
    GUILD_ID: "100000000000000001",
    OWNER_ID: "100000000000000002",
    DISCORD_TOKEN_SHENRON: "smoke-fixture-not-a-token",
  };
  const fixtured = Object.keys(fixture).filter((name) => !process.env[name]);
  for (const name of fixtured) process.env[name] = fixture[name];
  const started = performance.now();
  // Load the canvas fallback before the command barrel: several command modules import
  // the native renderer during module evaluation, including the smoke path.
  await import("./lib/preload");
  const { smokeCanvas } = await import("./lib/canvas-smoke");
  const canvasPngBytes = await smokeCanvas();
  await import("reflect-metadata");
  const { MetadataStorage } = await import("discordx");
  const { getBotRuntimeInfo } = await import("@aphrody/discord-kit");
  const runtime = getBotRuntimeInfo();
  await import("./_entries");
  const storage = MetadataStorage.instance;
  await storage.build();
  // A worker that does not resolve in the compiled binary only fails asynchronously, long after
  // boot: start the indexer worker and require its handshake, so a broken layout fails the build.
  const { startBundledWorker, whenWorkerReady } = await import("./lib/bundled-worker");
  const indexerWorker = startBundledWorker("indexer.ts");
  await whenWorkerReady(indexerWorker);
  indexerWorker.terminate();
  // The command graph registered the canvas fonts: a compiled release must find every
  // shipped font (SHENRON_BOT_ASSETS_DIR) and a colour emoji font from the system.
  const { GlobalFonts } = await import("@napi-rs/canvas");
  const { CANVAS_FONT_FILES } = await import("./lib/canvas-fonts");
  const families = new Set(GlobalFonts.families.map((entry) => entry.family));
  const canvasFontsMissing = CANVAS_FONT_FILES.map(([, family]) => family).filter(
    (family) => !families.has(family),
  );
  const emojiFont = ["Noto Color Emoji", "Segoe UI Emoji"].find((family) => families.has(family));
  if (runtime.isCompiled && (canvasFontsMissing.length > 0 || !emojiFont))
    throw new Error(
      `Canvas fonts missing: ${[...canvasFontsMissing, ...(emojiFont ? [] : ["colour emoji"])].join(", ")}`,
    );
  // Every card carries the wordmark of the site: a compiled release must ship the renderer
  // pictures (`scripts/ship-canvas-assets.ts`), found through SHENRON_BOT_ASSETS_DIR.
  const { RENDER_ASSET_FILES } = await import("./render/assets");
  const { botFile } = await import("./lib/asset-files");
  const renderAssetsMissing: string[] = [];
  for (const file of RENDER_ASSET_FILES) {
    if (!(await Bun.file(botFile(file)).exists())) renderAssetsMissing.push(file);
  }
  if (runtime.isCompiled && renderAssetsMissing.length > 0)
    throw new Error(`Render assets missing: ${renderAssetsMissing.join(", ")}`);
  console.log(
    JSON.stringify({
      smoke: "ok",
      canvasPngBytes,
      indexerWorker: "ready",
      canvasFonts: CANVAS_FONT_FILES.length - canvasFontsMissing.length,
      canvasFontsMissing,
      renderAssetsMissing,
      emojiFont: emojiFont ?? null,
      runtime: `Bun ${runtime.bunVersion}`,
      platform: `${runtime.platform}-${runtime.arch}`,
      compiled: runtime.isCompiled,
      slashCommands: storage.applicationCommandSlashesFlat.length,
      contextMenus:
        storage.applicationCommandMessages.length + storage.applicationCommandUsers.length,
      events: storage.events.length,
      discordClasses: storage.discords.length,
      fixtureEnv: fixtured,
      loadMs: Math.round(performance.now() - started),
    }),
  );
  process.exit(0);
}

if (process.argv.includes("--dry-run")) {
  // This owner only validates the environment; importing index starts databases,
  // migrations and Discord. Keep every runtime import after this early exit.
  await import("./lib/env");
  console.log("Configuration valid. No databases, migrations, services or Discord login started.");
  process.exit(0);
}

await import("reflect-metadata");
// Install the canvas fallback before loading command modules. This keeps the
// production binary bootable when the platform Skia addon is unavailable.
await import("./lib/preload");
await import("./index");
