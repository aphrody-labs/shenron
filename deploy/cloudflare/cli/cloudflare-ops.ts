// SPDX-License-Identifier: Apache-2.0
import { mkdir, rename, rmdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, dirname, join } from "node:path";

type Json = Record<string, unknown>;
export interface Manifest {
  accountId: string;
  zoneId: string;
  bucket: string;
  worker: string;
  tunnelId: string;
  workerConfig?: string;
  workerConfigSha256?: string;
  workerEntry?: string;
  workerEntrySha256?: string;
  dns?: { id: string; before: Json; desired: Json; preflightFile: string; preflightSha256: string };
  migration?: { shards: Array<{ file: string; sha256: string }> };
}
export function digest(input: string | Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex");
}
export function validateManifest(m: Manifest): void {
  if (
    !/^[a-f0-9]{32}$/.test(m.accountId) ||
    !/^[a-f0-9]{32}$/.test(m.zoneId) ||
    !/^[a-z0-9][a-z0-9-]{1,62}$/.test(m.bucket) ||
    !/^[a-z0-9-]+$/.test(m.worker) ||
    !/^[a-f0-9-]{36}$/.test(m.tunnelId)
  )
    throw new Error("Invalid manifest identity");
}
export function recordShape(r: Json): Json {
  return { type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: r.proxied };
}
export function sameRecord(a: Json, b: Json): boolean {
  return JSON.stringify(recordShape(a)) === JSON.stringify(recordShape(b));
}
export function guardDns(m: Manifest, actual: Json): void {
  if (!m.dns || !/^[a-f0-9]{32}$/.test(m.dns.id) || !sameRecord(actual, m.dns.before)) {
    throw new Error("DNS prior state differs; prepare a new manifest");
  }
  const desired = m.dns.desired;
  if (
    !["A", "AAAA", "CNAME"].includes(String(desired.type)) ||
    desired.name !== actual.name ||
    typeof desired.content !== "string" ||
    typeof desired.proxied !== "boolean" ||
    !Number.isInteger(desired.ttl)
  ) {
    throw new Error("DNS desired record invalid");
  }
}
export async function readToken(file?: string): Promise<string | undefined> {
  if (!file) return undefined;
  const info = await stat(file).catch((error: { code?: string }) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!info) return undefined;
  const credentialDirectory = process.env.CREDENTIALS_DIRECTORY;
  const directory =
    credentialDirectory && dirname(resolve(file)) === resolve(credentialDirectory)
      ? await stat(credentialDirectory)
      : undefined;
  const systemdCredential =
    process.platform !== "win32" &&
    credentialDirectory?.startsWith("/run/credentials/") &&
    directory?.uid === 0 &&
    !(directory.mode & 0o007) &&
    info.uid === 0 &&
    info.gid === directory.gid &&
    !(info.mode & 0o337);
  if (process.platform !== "win32" && info.mode & 0o077 && !systemdCredential)
    throw new Error(
      "Credential must have owner-only permissions or a sealed systemd credential directory",
    );
  const token = (await Bun.file(file).text()).trim();
  if (!token || /\s/.test(token)) throw new Error("Invalid credential file");
  return token;
}
async function checkedFile(
  file: string | undefined,
  hash: string | undefined,
  base: string,
): Promise<string> {
  if (!file || !hash || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Missing pinned artifact");
  const path = resolve(base, file);
  if (digest(new Uint8Array(await Bun.file(path).arrayBuffer())) !== hash)
    throw new Error("Artifact checksum mismatch");
  return path;
}
async function api(token: string, path: string, method = "GET", body?: unknown): Promise<unknown> {
  const response = await fetch("https://api.cloudflare.com/client/v4" + path, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json()) as {
    success: boolean;
    result: unknown;
    errors?: Array<{ code: number }>;
  };
  if (!response.ok || !payload.success) {
    // Do not log provider text, request headers, credentials, or raw configuration.
    throw new Error(
      "Cloudflare HTTP " +
        response.status +
        " codes " +
        (payload.errors?.map((e) => e.code).join(",") ?? ""),
    );
  }
  return payload.result;
}
export async function command(args: string[], token: string): Promise<void> {
  const child = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "ignore",
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: token,
      CI: "true",
      WRANGLER_SEND_METRICS: "false",
    },
  });
  const timer = setTimeout(() => child.kill(), 180000);
  try {
    if ((await child.exited) !== 0) throw new Error("CLI failed: " + args[0] + " " + args[1]);
  } finally {
    clearTimeout(timer);
  }
}
export async function run(argv: string[]): Promise<number> {
  const action = argv[0] ?? "status";
  if (action === "--help") {
    console.log(
      "cloudflare-ops status|r2|worker|dns|tunnel|migrate|reconcile --manifest FILE [--apply --manifest-sha256 HASH]\nCredentials: CLOUDFLARE_API_TOKEN_FILE only; state: CLOUDFLARE_OPS_STATE. Reconcile is always read-only.",
    );
    return 0;
  }
  const index = argv.indexOf("--manifest");
  if (index < 0 || !argv[index + 1]) throw new Error("Manifest required");
  const manifestPath = resolve(argv[index + 1]!);
  const bytes = await Bun.file(manifestPath).text();
  const m = JSON.parse(bytes) as Manifest;
  validateManifest(m);
  const manifestHash = digest(bytes);
  const apply = argv.includes("--apply");
  if (
    apply &&
    (!["r2", "worker", "dns"].includes(action) ||
      argv[argv.indexOf("--manifest-sha256") + 1] !== manifestHash ||
      !argv.includes("--manifest-sha256"))
  )
    throw new Error("Apply requires exact manifest SHA256 and a supported action");
  if (!["status", "r2", "worker", "dns", "tunnel", "migrate", "reconcile"].includes(action))
    throw new Error("Unknown action");
  const stateDir = resolve(process.env.CLOUDFLARE_OPS_STATE ?? dirname(manifestPath) + "/state");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const lock = stateDir + "/lock";
  await mkdir(lock, { mode: 0o700 }); // Exclusive, never steal another writer's lock.
  const started = new Date().toISOString();
  const result: Json = { action, started, manifest_sha256: manifestHash, apply, status: "running" };
  let exit = 0;
  try {
    const token = await readToken(process.env.CLOUDFLARE_API_TOKEN_FILE);
    result.authenticated = Boolean(token);
    if (!token)
      throw new Error("Authentication unavailable: provision owner-only CLOUDFLARE_API_TOKEN_FILE");
    await api(token, "/accounts/" + m.accountId); // Real account access, not token presence.
    const actions =
      action === "reconcile" || action === "status"
        ? ["r2", "worker", "dns", "tunnel", "migrate"]
        : [action];
    for (const item of actions) {
      try {
        const account = "/accounts/" + m.accountId;
        if (item === "r2") {
          const listing = (await api(token, account + "/r2/buckets")) as {
            buckets?: Array<{ name: string }>;
          };
          const exists = (listing.buckets ?? []).some((b) => b.name === m.bucket);
          if (apply && !exists)
            await api(token, account + "/r2/buckets", "POST", { name: m.bucket });
          result.r2 = { exists: exists || apply, created: apply && !exists };
        } else if (item === "worker") {
          const route = account + "/workers/scripts/" + m.worker + "/deployments";
          const previous = (await Bun.file(stateDir + "/worker-applied.json")
            .json()
            .catch(() => undefined)) as
            | { manifest_sha256: string; deployment_id?: string }
            | undefined;
          let before: { deployments?: Array<{ id?: string }> } | undefined;
          try {
            before = (await api(token, route)) as typeof before;
          } catch (error) {
            if (
              !apply ||
              !(error instanceof Error) ||
              !error.message.startsWith("Cloudflare HTTP 404 ")
            )
              throw error;
          }
          const alreadyApplied =
            apply &&
            previous?.manifest_sha256 === manifestHash &&
            Boolean(previous.deployment_id) &&
            previous.deployment_id === before?.deployments?.[0]?.id;
          if (apply && !alreadyApplied) {
            const config = await checkedFile(
              m.workerConfig,
              m.workerConfigSha256,
              dirname(manifestPath),
            );
            await checkedFile(m.workerEntry, m.workerEntrySha256, dirname(manifestPath));
            await command(
              [
                process.env.CLOUDFLARE_WRANGLER ?? join(homedir(), ".local/bin/wrangler"),
                "deploy",
                "--config",
                config,
                "--strict",
              ],
              token,
            );
          }
          const deployments = (apply && !alreadyApplied ? await api(token, route) : before) as {
            deployments?: Array<{ id?: string }>;
          };
          const deploymentId = deployments.deployments?.[0]?.id;
          if (apply) {
            if (!deploymentId) throw new Error("Worker deployment readback missing");
            await Bun.write(
              stateDir + "/worker-applied.tmp",
              JSON.stringify({ manifest_sha256: manifestHash, deployment_id: deploymentId }),
            );
            await rename(stateDir + "/worker-applied.tmp", stateDir + "/worker-applied.json");
          }
          result.worker = {
            deployments: deployments.deployments?.length ?? 0,
            deployment_id: deploymentId,
            applied: apply && !alreadyApplied,
            unchanged: alreadyApplied,
          };
        } else if (item === "dns") {
          const zone = (await api(token, "/zones/" + m.zoneId)) as Json;
          result.zone = { status: zone.status, name: zone.name };
          if (m.dns) {
            const actual = (await api(
              token,
              "/zones/" + m.zoneId + "/dns_records/" + m.dns.id,
            )) as Json;
            if (apply && !sameRecord(actual, m.dns.desired)) {
              if (zone.status !== "active") throw new Error("DNS zone not active");
              guardDns(m, actual);
              const evidenceFile = await checkedFile(
                m.dns.preflightFile,
                m.dns.preflightSha256,
                dirname(manifestPath),
              );
              const evidence = (await Bun.file(evidenceFile).json()) as Json;
              if (
                evidence.desired_record_sha256 !==
                  digest(JSON.stringify(recordShape(m.dns.desired))) ||
                evidence.copy_verified !== true ||
                evidence.import_disabled !== true ||
                evidence.health_verified !== true
              ) {
                throw new Error(
                  "DNS cutover requires pinned copy/import/health evidence matching desired record",
                );
              }
              await api(
                token,
                "/zones/" + m.zoneId + "/dns_records/" + m.dns.id,
                "PATCH",
                recordShape(m.dns.desired),
              );
            }
            const after = apply
              ? ((await api(token, "/zones/" + m.zoneId + "/dns_records/" + m.dns.id)) as Json)
              : actual;
            result.dns = { id: m.dns.id, matches_desired: sameRecord(after, m.dns.desired) };
            if (apply && !sameRecord(after, m.dns.desired))
              throw new Error("DNS readback mismatch");
          } else result.dns = { configured: false };
        } else if (item === "tunnel") {
          const tunnel = (await api(token, account + "/cfd_tunnel/" + m.tunnelId)) as Json;
          result.tunnel = {
            id: m.tunnelId,
            status: tunnel.status,
            connections: Array.isArray(tunnel.connections) ? tunnel.connections.length : 0,
          };
        } else if (item === "migrate") {
          for (const shard of m.migration?.shards ?? []) {
            const path = await checkedFile(shard.file, shard.sha256, dirname(manifestPath));
            const entries = (await Bun.file(path).json()) as Record<string, Json>;
            for (const [key, entry] of Object.entries(entries)) {
              if (
                !key.startsWith("/") ||
                !/^[a-f0-9]{64}$/.test(String(entry.sha256)) ||
                !Number.isSafeInteger(entry.size) ||
                Number(entry.size) < 0 ||
                typeof entry.contentType !== "string" ||
                typeof entry.cacheControl !== "string"
              ) {
                throw new Error("Migration manifest entry invalid");
              }
            }
          }
          result.migrate = {
            pinned_shards: m.migration?.shards.length ?? 0,
            copy_verified: false,
            dns_cutover_allowed: false,
          };
        }
      } catch (error) {
        if (action !== "reconcile" && action !== "status") throw error;
        result[item] = {
          status: "failed",
          error: error instanceof Error ? error.message : "Operation failed",
        };
        exit = 1;
      }
    }
    result.status = exit ? "failed" : "ok";
  } catch (error) {
    result.status = "failed";
    result.error = error instanceof Error ? error.message : "Operation failed";
    exit = 1;
  } finally {
    result.finished = new Date().toISOString();
    const text = JSON.stringify(result, null, 2) + "\n";
    const temp = stateDir + "/latest.tmp";
    try {
      await Bun.write(temp, text);
      await rename(temp, stateDir + "/latest.json");
      if (!exit) {
        await Bun.write(stateDir + "/last-success.tmp", text);
        await rename(stateDir + "/last-success.tmp", stateDir + "/last-success.json");
      }
      await Bun.write(stateDir + "/" + started.replaceAll(":", "-") + ".json", text);
    } finally {
      await rmdir(lock);
    }
    console.log(text.trimEnd());
  }
  return exit;
}
if (import.meta.main) {
  try {
    process.exitCode = await run(Bun.argv.slice(2));
  } catch {
    console.error(
      "cloudflare-ops precondition failed; inspect manifest, credential permissions, or concurrent lock",
    );
    process.exitCode = 1;
  }
}
