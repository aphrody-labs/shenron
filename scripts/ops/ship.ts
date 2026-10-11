// SPDX-License-Identifier: Apache-2.0
/** One-command crawl, build, CDN publication and deployment orchestrator. */
import { spawn } from "node:child_process";
import { crawlPublicationConfig } from "../data/crawl-beerus-site";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} est requis dans l'environnement protégé`);
  return value;
}

async function requireHumanReview(): Promise<void> {
  const path = required("SHENRON_HUMAN_REVIEW_RECEIPT");
  const reviewerEmail = required("SHENRON_HUMAN_REVIEWER_EMAIL").toLowerCase();
  const receipt = (await Bun.file(path)
    .json()
    .catch(() => undefined)) as
    | { reviewedBy?: string; reviewedAt?: string; decision?: string; capture?: string }
    | undefined;
  if (
    !receipt?.reviewedBy?.trim() ||
    receipt.reviewedBy.toLowerCase() !== reviewerEmail ||
    !receipt.reviewedAt ||
    receipt.decision !== "approved" ||
    !receipt.capture?.trim()
  )
    throw new Error("Le reçu de revue humaine est absent ou incomplet");
}

async function run(script: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${script} terminé avec ${signal ?? `code ${code ?? "inconnu"}`}`)),
    );
  });
}

const publication = crawlPublicationConfig();
const rawAutoDeploy = process.env.SHENRON_AUTO_DEPLOY;
if (rawAutoDeploy !== undefined && rawAutoDeploy !== "true" && rawAutoDeploy !== "false")
  throw new Error("SHENRON_AUTO_DEPLOY doit être true ou false");
await run("scripts/data/sync-beerus-site.ts", [
  "--out",
  required("SHENRON_CRAWL_OUTPUT"),
  "--iterations",
  process.env.SHENRON_CRAWL_ITERATIONS ?? "1",
]);
if (rawAutoDeploy === "true") {
  await requireHumanReview();
  if (publication.publicationRights !== "approved" || !publication.publicImagesPermitted)
    throw new Error("La revue humaine doit aussi être reflétée par la configuration protégée");
  await run("scripts/ops/release.ts", []);
} else console.log("Crawl terminé ; aucune publication ni activation automatique.");
