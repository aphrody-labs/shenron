// SPDX-License-Identifier: Apache-2.0
// Compatibility entry point; the canonical audit owns all collection and reporting.
import { join } from "node:path";

const args = Bun.argv.slice(2);
if (args.some((arg) => arg === "--apply" || arg.startsWith("--apply="))) {
  console.error(
    "--apply est refusé : cette commande délègue uniquement un audit en lecture seule.",
  );
  process.exitCode = 1;
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: bun scripts/ops/prepare-soshuhen-kanzenshuu-ingest.ts [--dry-run] [--origin URL] [--out var/reports/rapport.json]

Alias de scripts/ops/audit-sosh-readers.ts ; aucune ingestion Kanzenshuu ni écriture en base.
--dry-run est conservé pour compatibilité. --apply est toujours refusé.
Aucun DATABASE_URL requis. Les rapports restent dans var/reports/.`);
} else {
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "audit-sosh-readers.ts"),
      ...args.filter((arg) => arg !== "--dry-run"),
    ],
    { stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  );
  process.exitCode = await child.exited;
}
