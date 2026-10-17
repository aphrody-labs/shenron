// SPDX-License-Identifier: Apache-2.0
/** Materialize acquired Archive JP2 packages into a private, hashed page bundle. */
import { Database } from "bun:sqlite";
import { chmod, lstat, mkdir, rm, statfs } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const digest = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
const arg = (name: string, fallback?: string) => {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] : fallback;
};
const job = resolve(arg("--job") ?? "");
if (!job || job === resolve("")) throw Error("Absolute --job is required");
const limit = Number(arg("--limit", "8"));
const maxBytes = Number(arg("--max-bytes", String(8 * 2 ** 30)));
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) throw Error("Invalid --limit");
if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw Error("Invalid --max-bytes");

const acquired = join(job, "acquired"),
  receipts = join(job, "receipts");
const output = join(job, "derived", "archive-pages");
const temp = join(job, "derived", ".archive-materialize");
await mkdir(output, { recursive: true, mode: 0o700 });
await mkdir(temp, { recursive: true, mode: 0o700 });
const space = await statfs(job);
if (space.bavail * space.bsize < 8 * 2 ** 30)
  throw Error("Private materializer requires 8GiB free reserve");

async function run(command: string[]) {
  const child = Bun.spawn(command, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw Error(`${command[0]} failed: ${stderr.slice(-2000)}`);
  return stdout;
}
async function runBytes(command: string[]) {
  const child = Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).bytes(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw Error(`${command[0]} failed: ${stderr.slice(-2000)}`);
  return stdout;
}
function pagesFromListing(text: string) {
  return text
    .split(/\r?\nPath = /u)
    .map((part) => part.split(/\r?\n/u, 1)[0]!)
    .filter((path) => /\.jp2$/iu.test(path))
    .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
async function json(path: string, value: unknown) {
  await Bun.write(path, JSON.stringify(value, null, 2) + "\n");
  await chmod(path, 0o600);
}

const db = new Database(join(job, "frontier.sqlite"), { readonly: true });
const rows = db
  .query<{ receipt: string }, []>(
    "SELECT receipt FROM pool_tasks WHERE kind='acquisition' AND state='done' AND receipt != '' ORDER BY updatedAt DESC",
  )
  .all();
db.close();
let processed = 0;
let written = 0;
for (const row of rows) {
  if (processed >= limit || written >= maxBytes) break;
  const receiptPath = resolve(row.receipt);
  const within = relative(resolve(receipts), receiptPath);
  if (within.startsWith("..") || within.includes("\\") || !/^[a-f0-9]{64}\.json$/u.test(within))
    continue;
  const receipt = await Bun.file(receiptPath).json();
  if (
    receipt.contentType !== "application/zip" ||
    !String(receipt.sourceUrl).startsWith("https://archive.org/")
  )
    continue;
  const archivePath = resolve(receipt.assetPath);
  const archiveRel = relative(resolve(acquired), archivePath);
  if (archiveRel.startsWith("..") || !/^[a-f0-9]{64}$/u.test(archiveRel)) continue;
  const archiveInfo = await lstat(archivePath);
  if (!archiveInfo.isFile() || archiveInfo.isSymbolicLink() || archiveInfo.size !== receipt.bytes)
    continue;
  const identity = receipt.sha256;
  const manifestPath = join(output, identity + ".json");
  if (await Bun.file(manifestPath).exists()) continue;
  const work = join(temp, identity);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true, mode: 0o700 });
  const listing = await run(["7z", "l", "-slt", archivePath]);
  const entries = pagesFromListing(listing);
  if (entries.length < 2 || entries.length > 2500) continue;
  const pages: {
    index: number;
    archivePath: string;
    path: string;
    sha256: string;
    bytes: number;
    contentType: "image/jpeg";
  }[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const jp2 = join(work, "source.jp2");
    const jpg = join(work, String(index + 1).padStart(4, "0") + ".jpg");
    const data = await runBytes(["7z", "e", "-so", archivePath, entry]);
    await Bun.write(jp2, data);
    await run(["magick", jp2, "-strip", "-quality", "92", jpg]);
    const bytes = await Bun.file(jpg).bytes();
    const sha256 = digest(bytes);
    const target = join(output, identity, sha256 + ".jpg");
    await mkdir(join(output, identity), { recursive: true, mode: 0o700 });
    if (!(await Bun.file(target).exists())) await Bun.write(target, bytes);
    await chmod(target, 0o600);
    pages.push({
      index: index + 1,
      archivePath: entry,
      path: target,
      sha256,
      bytes: bytes.length,
      contentType: "image/jpeg",
    });
    written += bytes.length;
    if (written >= maxBytes) throw Error("Materializer cycle budget exceeded");
  }
  await json(manifestPath, {
    schema: "shenron-private-archive-page-bundle/v1",
    sourceUrl: receipt.sourceUrl,
    archiveSha256: identity,
    archiveBytes: receipt.bytes,
    publicationEligible: false,
    reason: "edition-identity-and-independent-pagination-review-required",
    pages,
  });
  processed++;
  await rm(work, { recursive: true, force: true });
}
await rm(temp, { recursive: true, force: true });
console.log(JSON.stringify({ processed, written, output }));
