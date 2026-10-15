// SPDX-License-Identifier: Apache-2.0
import {
  mkdir,
  rename,
  rmdir,
  chmod,
  open,
  unlink,
  lstat,
  realpath,
  chown,
} from "node:fs/promises";
import { resolve, dirname, isAbsolute, relative, join } from "node:path";
import { readToken, validateManifest, type Manifest } from "./cloudflare-ops";

interface Profile {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  bucket: string;
  prefixes: string[];
  permission: string;
  expiresAt: string;
}
export interface ConsumerProjection {
  dataRoot: string;
  directory: string;
  uid: number;
  gid: number;
}
function consumerLocation(target: ConsumerProjection) {
  if (
    !isAbsolute(target.dataRoot) ||
    !isAbsolute(target.directory) ||
    !Number.isSafeInteger(target.uid) ||
    target.uid < 1 ||
    target.uid > 0xffffffff ||
    !Number.isSafeInteger(target.gid) ||
    target.gid < 1 ||
    target.gid > 0xffffffff
  )
    throw new Error("Invalid consumer projection identity");
  const root = resolve(target.dataRoot),
    directory = resolve(target.directory),
    child = relative(root, directory);
  const parts = child.split(/[\\/]/);
  if (
    !child ||
    isAbsolute(child) ||
    parts.some((part) => part === ".." || !part) ||
    parts.length > 8
  )
    throw new Error("Consumer projection must stay inside the explicit data root");
  return { root, directory, parts };
}
/** The root issuer projects only its bounded temporary S3 grant, never the parent API token. */
export async function projectConsumerProfile(profile: Profile, target: ConsumerProjection) {
  target = { ...target };
  profile = { ...profile, prefixes: [...profile.prefixes] };
  const { root, directory, parts } = consumerLocation(target);
  const rootInfo = await lstat(root);
  if (
    !rootInfo.isDirectory() ||
    rootInfo.isSymbolicLink() ||
    (await realpath(root)) !== root ||
    (rootInfo.mode & 0o022) !== 0 ||
    ![0, target.uid].includes(rootInfo.uid)
  )
    throw new Error("Consumer data root is not trusted");
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    let created = false;
    try {
      await mkdir(current, { mode: 0o700 });
      created = true;
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
    }
    if (created) {
      await chown(current, target.uid, target.gid);
      await chmod(current, 0o700);
    }
    const info = await lstat(current);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== target.uid ||
      info.gid !== target.gid ||
      (info.mode & 0o777) !== 0o700 ||
      (await realpath(current)) !== current
    )
      throw new Error("Consumer projection directory is not private");
  }
  const file = join(directory, "s3.json");
  try {
    const info = await lstat(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.uid !== target.uid ||
      info.gid !== target.gid ||
      (info.mode & 0o777) !== 0o400
    )
      throw new Error("Consumer projection file is not private");
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
  const tmp = join(directory, ".s3-" + crypto.randomUUID());
  const handle = await open(tmp, "wx", 0o600);
  try {
    // Deliberately enumerate the grant: future parent-credential fields never leak into consumers.
    await handle.writeFile(
      JSON.stringify({
        endpoint: profile.endpoint,
        region: profile.region,
        accessKeyId: profile.accessKeyId,
        secretAccessKey: profile.secretAccessKey,
        sessionToken: profile.sessionToken,
        bucket: profile.bucket,
        prefixes: profile.prefixes,
        permission: profile.permission,
        expiresAt: profile.expiresAt,
      }),
    );
    await handle.chmod(0o400);
    await handle.chown(target.uid, target.gid);
    await handle.close();
    await rename(tmp, file);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
  return {
    directory,
    uid: target.uid,
    gid: target.gid,
    mode: "0400",
    expiresAt: profile.expiresAt,
  };
}
export function grant(bucket: string, parentAccessKeyId: string) {
  if (!/^[a-f0-9]{32}$/.test(parentAccessKeyId) || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket))
    throw new Error("Invalid S3 grant identity");
  return {
    bucket,
    parentAccessKeyId,
    permission: "object-read-write",
    ttlSeconds: 3600,
    prefixes: ["_objects/", "_migration/"],
  };
}
export function validateProfile(p: Profile, m: Manifest) {
  if (
    p.endpoint !== `https://${m.accountId}.r2.cloudflarestorage.com` ||
    p.bucket !== m.bucket ||
    p.permission !== "object-read-write" ||
    JSON.stringify(p.prefixes) !== JSON.stringify(["_objects/", "_migration/"]) ||
    !p.accessKeyId ||
    !p.secretAccessKey ||
    !p.sessionToken ||
    [p.accessKeyId, p.secretAccessKey, p.sessionToken].some(
      (value) => typeof value !== "string" || /\s/.test(value),
    ) ||
    !Number.isFinite(Date.parse(p.expiresAt))
  )
    throw new Error("S3 profile scope differs");
}
async function api(path: string, token: string, body?: unknown) {
  const r = await fetch("https://api.cloudflare.com/client/v4" + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  const j = (await r.json()) as {
    success?: boolean;
    result: Record<string, unknown>;
    errors?: { code: number }[];
  };
  if (!r.ok || !j.success)
    throw new Error(`Cloudflare HTTP ${r.status} codes ${j.errors?.map((e) => e.code).join(",")}`);
  return j.result;
}
async function atomic(path: string, text: string) {
  const tmp = path + ".next";
  const handle = await open(tmp, "wx", 0o600);
  try {
    await handle.writeFile(text);
    await handle.close();
    await chmod(tmp, 0o400);
    await rename(tmp, path);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}
export async function run(args: string[]) {
  const action = args[0];
  if (action === "--help") {
    console.log(
      "cloudflare-s3 status|renew|probe --manifest FILE --profile FILE [--apply] [--consumer-data-root DIR --consumer-directory DIR --consumer-uid UID --consumer-gid GID]",
    );
    return;
  }
  const flag = (name: string) => args[args.indexOf(name) + 1];
  if (
    !args.includes("--manifest") ||
    !args.includes("--profile") ||
    !["status", "renew", "probe"].includes(action ?? "")
  )
    throw new Error("Invalid command");
  const m = (await Bun.file(resolve(flag("--manifest")!)).json()) as Manifest;
  validateManifest(m);
  const file = resolve(flag("--profile")!);
  const consumerFlags = [
    "--consumer-data-root",
    "--consumer-directory",
    "--consumer-uid",
    "--consumer-gid",
  ];
  const consumerCount = consumerFlags.filter((name) => args.includes(name)).length;
  if (consumerCount !== 0 && (consumerCount !== 4 || action !== "renew"))
    throw new Error("Consumer projection requires the complete renew configuration");
  const consumer =
    consumerCount === 4
      ? {
          dataRoot: flag("--consumer-data-root")!,
          directory: flag("--consumer-directory")!,
          uid: Number(flag("--consumer-uid")),
          gid: Number(flag("--consumer-gid")),
        }
      : undefined;
  if (consumer) consumerLocation(consumer);
  if (process.platform !== "win32" && process.getuid?.() !== 0)
    throw new Error("S3 profile provisioning requires owner root job");
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  let p = (await Bun.file(file).exists()) ? ((await Bun.file(file).json()) as Profile) : undefined;
  if (p) {
    const info = await lstat(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      (process.platform !== "win32" && (info.mode & 0o077 || info.uid !== 0))
    )
      throw new Error("S3 profile permissions invalid");
    validateProfile(p, m);
  }
  let renewed = false;
  if (action === "renew") {
    if (!args.includes("--apply")) throw new Error("Renew requires explicit --apply");
    const lock = file + ".lock";
    await mkdir(lock);
    try {
      if (!p || Date.parse(p.expiresAt) - Date.now() < 600000) {
        const token = await readToken(process.env.CLOUDFLARE_API_TOKEN_FILE);
        if (!token) throw new Error("API credential unavailable");
        const v = await api("/user/tokens/verify", token);
        const g = grant(m.bucket, String(v.id));
        const j = await api(`/accounts/${m.accountId}/r2/temp-access-credentials`, token, g);
        p = {
          endpoint: `https://${m.accountId}.r2.cloudflarestorage.com`,
          region: "auto",
          accessKeyId: String(j.accessKeyId ?? ""),
          secretAccessKey: String(j.secretAccessKey ?? ""),
          sessionToken: String(j.sessionToken ?? ""),
          bucket: m.bucket,
          prefixes: g.prefixes,
          permission: g.permission,
          expiresAt: new Date(Date.now() + g.ttlSeconds * 1000).toISOString(),
        };
        validateProfile(p, m);
        await atomic(file, JSON.stringify(p));
        renewed = true;
      }
      await atomic(
        resolve(dirname(file), "shenron-rclone.conf"),
        `[shenron-r2]\ntype=s3\nprovider=Cloudflare\naccess_key_id=${p.accessKeyId}\nsecret_access_key=${p.secretAccessKey}\nsession_token=${p.sessionToken}\nendpoint=${p.endpoint}\nregion=auto\nno_check_bucket=true\n`,
      );
    } finally {
      await rmdir(lock);
    }
  }
  if (!p) throw new Error("S3 profile unavailable");
  if (Date.parse(p.expiresAt) <= Date.now())
    throw new Error("S3 profile expired; renew explicitly");
  const projection = consumer ? await projectConsumerProfile(p, consumer) : undefined;
  if (action === "probe") {
    const body = await new Bun.S3Client(p).file("_migration/manifests/00.json").arrayBuffer();
    console.log(
      JSON.stringify({
        status: "ok",
        operation: "S3Client GET",
        size: body.byteLength,
        sha256: new Bun.CryptoHasher("sha256").update(body).digest("hex"),
      }),
    );
  }
  console.log(
    JSON.stringify({
      status: "ok",
      profile: file,
      bucket: p.bucket,
      prefixes: p.prefixes,
      permission: p.permission,
      expiresAt: p.expiresAt,
      renewed,
      ...(projection ? { consumerProjection: projection } : {}),
    }),
  );
}
if (import.meta.main)
  run(Bun.argv.slice(2)).catch(() => {
    console.error("S3 profile operation failed; inspect scope, auth, expiry, permissions or lock");
    process.exitCode = 1;
  });
