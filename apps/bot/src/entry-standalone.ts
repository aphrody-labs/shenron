if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Shenron Discord Bot + Public API`);
  console.log(`Usage: shenron [options]\n`);
  console.log(`Options:`);
  console.log(`  -h, --help     Show this help message`);
  console.log(`  -v, --version  Show version and runtime info`);
  console.log(`  --dry-run      Validate environment and exit without services or Discord login`);
  console.log(`  --smoke        Load every command and event in this binary, without databases or Discord`);
  process.exit(0);
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(
    `@shenron/bot v1.0.0 (Bun ${typeof Bun !== "undefined" ? Bun.version : process.version})`,
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
  await import("reflect-metadata");
  const { MetadataStorage } = await import("discordx");
  await import("./_entries");
  const storage = MetadataStorage.instance;
  await storage.build();
  console.log(
    JSON.stringify({
      smoke: "ok",
      runtime: `Bun ${Bun.version}`,
      slashCommands: storage.applicationCommandSlashesFlat.length,
      contextMenus: storage.applicationCommandMessages.length + storage.applicationCommandUsers.length,
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
await import("./index");
