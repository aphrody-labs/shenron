// SPDX-License-Identifier: Apache-2.0
/** Sealed, bounded data handoff. Source credentials and the pool database never leave their host. */
import { Database } from "bun:sqlite";
import { chmod, lstat, mkdir, rename, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  mangaCandidateSchema,
  type MangaCandidate,
} from "@aphrody/shenron-pipeline/dragon-ball/manga-publication-contract";
import { mangaDigest } from "./manga-cdn-projection";

interface Pin {
  path: string;
  sha256: string;
}
interface Image {
  url: string;
  sha256: string;
  size: number;
  contentType: string;
}
interface Handoff {
  schema: "shenron-manga-pool-handoff/v1";
  candidates: MangaCandidate[];
  images: Image[];
  files: { sha256: string; size: number }[];
}
export interface HandoffImport {
  inbox: string;
  root: string;
  configSha256: string;
  policySha256: string;
}
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
async function privateDir(path: string) {
  if (!isAbsolute(path)) throw Error("Absolute private handoff directory required");
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    info.mode & 0o077 ||
    (await realpath(path)) !== resolve(path)
  )
    throw Error("Private handoff directory identity differs");
}
async function save(path: string, value: unknown) {
  const text = JSON.stringify(value);
  await Bun.write(path + ".next", text);
  await chmod(path + ".next", 0o600);
  await rename(path + ".next", path);
  return mangaDigest(text);
}
async function bytes(pin: Pin, limit: number) {
  const info = await lstat(pin.path);
  if (!isAbsolute(pin.path) || !info.isFile() || info.isSymbolicLink() || info.size > limit)
    throw Error("Invalid handoff source file");
  const body = await Bun.file(pin.path).bytes();
  if (mangaDigest(body) !== pin.sha256) throw Error("Handoff source SHA differs");
  return body;
}
function inside(root: string, path: string) {
  const child = relative(resolve(root), resolve(path));
  return !!child && !isAbsolute(child) && !child.startsWith("..");
}

export async function exportMangaHandoff(
  pool: string,
  out: string,
  limits = { candidates: 2, bytes: 64 * 1024 * 1024 },
) {
  await privateDir(out);
  await privateDir(join(pool, "derived/candidate-inbox"));
  if (!(await Bun.file(join(pool, "frontier.sqlite")).exists()))
    return { complete: true, empty: true, artifacts: 0, waiting: "source-pool-frontier" };
  const statePath = join(out, "export-state.json");
  const state = (await Bun.file(statePath).exists())
    ? ((await Bun.file(statePath).json()) as { sent: string[]; metadata: string[] })
    : { sent: [], metadata: [] };
  const sent = new Set(state.sent),
    known = new Set(state.metadata),
    contents: Record<string, Uint8Array> = {};
  const candidates: MangaCandidate[] = [],
    images: Image[] = [];
  let total = 0,
    inspected = 0;
  await privateDir(join(out, "quarantine"));
  const database = new Database(join(pool, "frontier.sqlite"), { readonly: true });
  try {
    for await (const name of new Bun.Glob("*.json").scan({
      cwd: join(pool, "derived/candidate-inbox"),
      onlyFiles: true,
    })) {
      if (++inspected > 5000) throw Error("Handoff source enumeration exceeds bound");
      if (candidates.length >= limits.candidates) break;
      const priorFiles = new Set(Object.keys(contents)),
        priorTotal = total;
      try {
        const candidate = mangaCandidateSchema.parse(
          await Bun.file(join(pool, "derived/candidate-inbox", name)).json(),
        );
        const identity = mangaDigest(JSON.stringify(candidate));
        const selected: Image[] = [];
        for (const page of candidate.pages) {
          const task = database
            .query<{ receipt: string }, [string]>(
              "SELECT receipt FROM pool_tasks WHERE kind='acquisition' AND state='done' AND url=?",
            )
            .get(page.sourceUrl);
          if (!task) continue;
          if (!inside(join(pool, "receipts"), task.receipt))
            throw Error("Acquisition receipt escaped pool owner");
          const receipt = await Bun.file(task.receipt).json();
          if (
            receipt.sourceUrl !== page.sourceUrl ||
            receipt.httpStatus !== 200 ||
            !sha(receipt.sha256) ||
            !Number.isSafeInteger(receipt.bytes) ||
            receipt.bytes < 1 ||
            !inside(join(pool, "acquired"), receipt.assetPath)
          )
            throw Error("Pool acquisition receipt differs");
          const image = {
            url: page.sourceUrl,
            sha256: receipt.sha256,
            size: receipt.bytes,
            contentType: String(receipt.contentType).split(";")[0]!.trim(),
          };
          selected.push(image);
          if (sent.has(image.sha256) || contents[image.sha256]) continue;
          if (total + image.size > limits.bytes) continue;
          const body = await bytes(
            { path: receipt.assetPath, sha256: image.sha256 },
            33 * 1024 * 1024,
          );
          if (body.length !== image.size) throw Error("Pool acquisition size differs");
          contents[image.sha256] = body;
          total += body.length;
        }
        // Keep candidates with pending assets: the importer/consumer waits for the exact acquired bytes.
        if (known.has(identity) && !selected.some((image) => contents[image.sha256])) continue;
        for (const pin of [
          candidate.source.config,
          candidate.source.input,
          candidate.source.policy,
        ]) {
          const body = await bytes(pin, 16 * 1024 * 1024);
          if (total + body.length > limits.bytes)
            throw Error("Source metadata exceeds handoff cycle budget");
          contents[pin.sha256] = body;
          total += body.length;
        }
        const config = JSON.parse(
          new TextDecoder().decode(contents[candidate.source.config.sha256]),
        );
        // Only path references to owner stores may travel, never credentials embedded in configuration.
        if (
          config.store &&
          Object.keys(config.store).some(
            (key) => !["manifest", "profile", "sdkModule", "consumerProfileRoot"].includes(key),
          )
        )
          throw Error("Source template contains unapproved store fields");
        if (
          JSON.stringify(config).match(
            /"(?:secretAccessKey|sessionToken|accessKeyId|authorization|password)"\s*:/i,
          )
        )
          throw Error("Credentials cannot enter a handoff");
        candidates.push(candidate);
        images.push(
          ...selected.filter((image) => !!contents[image.sha256] || sent.has(image.sha256)),
        );
      } catch {
        for (const key of Object.keys(contents)) if (!priorFiles.has(key)) delete contents[key];
        total = priorTotal;
        await save(join(out, "quarantine", mangaDigest(name) + ".json"), {
          candidateFileSha256: mangaDigest(name),
          observedAt: new Date().toISOString(),
          reason: "source-handoff-validation-failed",
        });
      }
    }
  } finally {
    database.close();
  }
  if (!candidates.length) return { complete: true, empty: true, artifacts: 0 };
  const files = Object.entries(contents).map(([sha256, body]) => ({ sha256, size: body.length }));
  const manifest: Handoff = { schema: "shenron-manga-pool-handoff/v1", candidates, images, files };
  const text = JSON.stringify(manifest),
    identity = mangaDigest(text),
    archivePath = join(out, identity + ".tar"),
    descriptorPath = join(out, identity + ".handoff.json");
  const archive: Record<string, Uint8Array | string> = { "manifest.json": text };
  for (const [hash, body] of Object.entries(contents)) archive["files/" + hash] = body;
  if (!(await Bun.file(archivePath).exists())) {
    await Bun.write(archivePath, await new Bun.Archive(archive).bytes());
    await chmod(archivePath, 0o600);
  }
  const archiveBytes = await Bun.file(archivePath).bytes();
  const descriptor = {
    schema: "shenron-manga-pool-handoff-archive/v1",
    archive: identity + ".tar",
    archiveSha256: mangaDigest(archiveBytes),
    manifestSha256: identity,
    size: archiveBytes.length,
  };
  await save(descriptorPath, descriptor);
  return {
    complete: true,
    empty: false,
    artifacts: files.length,
    archivePath,
    descriptorPath,
    descriptor,
    ack: async () => {
      for (const file of files) sent.add(file.sha256);
      for (const candidate of candidates) known.add(mangaDigest(JSON.stringify(candidate)));
      await save(statePath, { sent: [...sent], metadata: [...known] });
    },
  };
}

export async function importMangaHandoff(descriptorPath: string, config: HandoffImport) {
  await privateDir(config.root);
  const descriptor = await Bun.file(descriptorPath).json();
  if (
    descriptor.schema !== "shenron-manga-pool-handoff-archive/v1" ||
    !sha(descriptor.archiveSha256) ||
    !sha(descriptor.manifestSha256) ||
    descriptor.archive !== descriptor.manifestSha256 + ".tar" ||
    !Number.isSafeInteger(descriptor.size) ||
    descriptor.size > 80 * 1024 * 1024
  )
    throw Error("Invalid bounded handoff descriptor");
  const archivePath = join(dirname(descriptorPath), descriptor.archive),
    archive = await bytes(
      { path: archivePath, sha256: descriptor.archiveSha256 },
      80 * 1024 * 1024,
    );
  if (archive.length !== descriptor.size) throw Error("Handoff archive size differs");
  if (new TextDecoder().decode(archive.slice(257, 262)) !== "ustar")
    throw Error("Only bounded uncompressed handoff tar is accepted");
  const entries = await new Bun.Archive(archive).files();
  const manifestText = await entries.get("manifest.json")?.text();
  if (!manifestText || mangaDigest(manifestText) !== descriptor.manifestSha256)
    throw Error("Sealed handoff manifest differs");
  const manifest = JSON.parse(manifestText) as Handoff;
  if (
    manifest.schema !== "shenron-manga-pool-handoff/v1" ||
    !Array.isArray(manifest.candidates) ||
    manifest.candidates.length > 2 ||
    !Array.isArray(manifest.images) ||
    manifest.images.length > 5000 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > 5100 ||
    entries.size !== manifest.files.length + 1
  )
    throw Error("Handoff manifest bounds differ");
  for (const raw of manifest.candidates) {
    const candidate = mangaCandidateSchema.parse(raw);
    if (
      candidate.source.config.sha256 !== config.configSha256 ||
      candidate.source.policy.sha256 !== config.policySha256
    )
      throw Error("Handoff template differs from configured owner pins");
  }
  let total = 0;
  for (const file of manifest.files) {
    if (
      !sha(file.sha256) ||
      !Number.isSafeInteger(file.size) ||
      file.size < 1 ||
      (total += file.size) > 72 * 1024 * 1024
    )
      throw Error("Handoff file budget exceeded");
    const entry = entries.get("files/" + file.sha256);
    if (!entry || entry.size !== file.size || mangaDigest(await entry.bytes()) !== file.sha256)
      throw Error("Handoff member differs");
  }
  const completed = join(config.root, "imports", descriptor.manifestSha256 + ".json");
  if (await Bun.file(completed).exists()) return { replay: true, candidates: 0, images: 0 };
  for (const dir of ["imports", "inputs", "acquired", "receipts", "derived/candidate-inbox"])
    await privateDir(join(config.root, dir));
  const database = new Database(join(config.root, "frontier.sqlite"));
  database.exec(
    "PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS pool_tasks(kind TEXT,state TEXT,url TEXT PRIMARY KEY,receipt TEXT)",
  );
  await chmod(join(config.root, "frontier.sqlite"), 0o600);
  try {
    for (const image of manifest.images) {
      if (
        !sha(image.sha256) ||
        !Number.isSafeInteger(image.size) ||
        !/^image\/(png|jpeg|webp)$/.test(image.contentType)
      )
        throw Error("Invalid handoff image metadata");
      const parsed = new URL(image.url);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        /(^|\.)fandom\.com$/i.test(parsed.hostname)
      )
        throw Error("Invalid handoff image source");
      const target = join(config.root, "acquired", image.sha256),
        member = entries.get("files/" + image.sha256);
      if (member) {
        await Bun.write(target, await member.bytes());
        await chmod(target, 0o600);
      }
      if (!(await Bun.file(target).exists())) continue;
      const body = await Bun.file(target).bytes();
      if (body.length !== image.size || mangaDigest(body) !== image.sha256)
        throw Error("Imported image bytes differ");
      const receipt = join(config.root, "receipts", mangaDigest(image.url) + ".json");
      await save(receipt, {
        sourceUrl: image.url,
        httpStatus: 200,
        assetPath: target,
        sha256: image.sha256,
        bytes: image.size,
        contentType: image.contentType,
        publicationEligible: false,
        handoffManifestSha256: descriptor.manifestSha256,
      });
      database
        .query("INSERT OR REPLACE INTO pool_tasks VALUES ('acquisition','done',?,?)")
        .run(image.url, receipt);
    }
    for (const raw of manifest.candidates) {
      const candidate = mangaCandidateSchema.parse(raw);
      if (
        candidate.source.config.sha256 !== config.configSha256 ||
        candidate.source.policy.sha256 !== config.policySha256
      )
        throw Error("Handoff template differs from configured owner pins");
      for (const key of ["config", "input", "policy"] as const) {
        const pin = candidate.source[key],
          member = entries.get("files/" + pin.sha256);
        if (!member) throw Error("Pinned candidate input missing");
        const path = join(
          config.root,
          "inputs",
          pin.sha256 + (key === "input" ? ".jsonl" : ".json"),
        );
        await Bun.write(path, await member.bytes());
        await chmod(path, 0o600);
        candidate.source[key] = { path, sha256: pin.sha256 };
      }
      await save(
        join(
          config.root,
          "derived/candidate-inbox",
          mangaDigest(JSON.stringify(candidate)) + ".json",
        ),
        candidate,
      );
    }
    await save(completed, {
      importedAt: new Date().toISOString(),
      manifestSha256: descriptor.manifestSha256,
      candidates: manifest.candidates.length,
      images: manifest.images.length,
    });
    return {
      replay: false,
      candidates: manifest.candidates.length,
      images: manifest.images.length,
    };
  } finally {
    database.close();
  }
}

export async function importPendingMangaHandoffs(config: HandoffImport) {
  await privateDir(config.inbox);
  await privateDir(config.root);
  await privateDir(join(config.root, "rejections"));
  const receipts = [];
  let files = 0;
  for await (const name of new Bun.Glob("*.handoff.json").scan({
    cwd: config.inbox,
    onlyFiles: true,
  })) {
    if (++files > 5000) throw Error("Handoff inbox enumeration exceeds bound");
    if (!/^[a-f0-9]{64}\.handoff\.json$/.test(name)) continue;
    if (await Bun.file(join(config.root, "imports", name.slice(0, 64) + ".json")).exists())
      continue;
    const descriptorPath = join(config.inbox, name);
    const descriptorHash = mangaDigest(await Bun.file(descriptorPath).bytes());
    const rejected = join(config.root, "rejections", name);
    if (await Bun.file(rejected).exists()) {
      const previous = await Bun.file(rejected).json();
      if (previous.descriptorSha256 === descriptorHash) continue;
    }
    if (receipts.length >= 2) break;
    try {
      receipts.push(await importMangaHandoff(descriptorPath, config));
    } catch {
      await save(rejected, {
        descriptorSha256: descriptorHash,
        observedAt: new Date().toISOString(),
        reason: "sealed-handoff-validation-failed",
      });
      receipts.push({
        complete: false,
        archiveSha256: name.slice(0, 64),
        reason: "sealed-handoff-validation-failed",
      });
    }
  }
  return receipts;
}
if (import.meta.main) {
  const [mode, path] = Bun.argv.slice(2);
  if (!path || !isAbsolute(path))
    throw Error("Usage: manga-pool-handoff export|import /private/config.json");
  const config = await Bun.file(path).json();
  if (mode === "import") console.log(JSON.stringify(await importPendingMangaHandoffs(config)));
  else if (mode === "export") {
    const result = await exportMangaHandoff(config.pool, config.out);
    if (!result.empty && result.descriptorPath && result.archivePath) {
      if (!isAbsolute(config.destination) || !/^\/[a-zA-Z0-9/_.-]+$/.test(config.destination))
        throw Error("Explicit safe private destination required");
      for (const file of [result.archivePath, result.descriptorPath]) {
        const descriptor = file === result.descriptorPath;
        const process = Bun.spawn(
          [
            "aphrody",
            "infra",
            "ssh",
            "sftp",
            "--host",
            "dbfr",
            "--path",
            config.destination + "/" + file.split("/").at(-1) + (descriptor ? ".pending" : ""),
            "--put",
            file,
          ],
          { stdout: "pipe", stderr: "pipe", timeout: 300000 },
        );
        const output = new Response(process.stdout).text(),
          errors = new Response(process.stderr).text();
        await Promise.all([output, errors]);
        if ((await process.exited) !== 0) throw Error("Infra sealed handoff transfer failed");
      }
      const target = config.destination + "/" + result.descriptorPath.split("/").at(-1);
      // Ready descriptors appear only after both SFTP transfers have completed.
      const code =
        'await import("node:fs/promises").then(fs=>fs.rename(' +
        JSON.stringify(target + ".pending") +
        "," +
        JSON.stringify(target) +
        "))";
      const quoted = "'" + code.replaceAll("'", "'\\''") + "'";
      const publish = Bun.spawn(
        ["aphrody", "infra", "ssh", "exec", "--host", "dbfr", "-c", "bun -e " + quoted],
        { stdout: "pipe", stderr: "pipe", timeout: 30000 },
      );
      await Promise.all([new Response(publish.stdout).text(), new Response(publish.stderr).text()]);
      if ((await publish.exited) !== 0) throw Error("Infra sealed handoff acknowledgement failed");
      await result.ack?.();
    }
    console.log(JSON.stringify({ ...result, ack: undefined }));
  } else throw Error("Unknown handoff operation");
}
