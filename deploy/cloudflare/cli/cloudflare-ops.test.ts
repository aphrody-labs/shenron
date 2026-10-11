// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  digest,
  guardDns,
  readToken,
  run,
  sameRecord,
  validateManifest,
  type Manifest,
} from "./cloudflare-ops";
const manifest: Manifest = {
  accountId: "a".repeat(32),
  zoneId: "b".repeat(32),
  bucket: "shenron-cdn",
  worker: "shenron-cdn",
  tunnelId: "f2ddf195-5d19-4321-8b12-259c7c57659b",
};
test("invalid identity cannot reach provider", () => {
  expect(() => validateManifest({ ...manifest, accountId: "../account" })).toThrow();
});
test("DNS compare ignores provider metadata, preserves TTL/type/proxy", () => {
  const record = {
    type: "CNAME",
    name: "cdn.example.com",
    content: "before.example.com",
    ttl: 1,
    proxied: true,
  };
  expect(sameRecord(record, { ...record, id: "x", comment: "metadata" })).toBe(true);
  expect(sameRecord(record, { ...record, proxied: false })).toBe(false);
  const m = {
    ...manifest,
    dns: {
      id: "c".repeat(32),
      before: record,
      desired: { ...record, content: "after.example.com" },
      preflightFile: "evidence.json",
      preflightSha256: "d".repeat(64),
    },
  };
  expect(() => guardDns(m, record)).not.toThrow();
  expect(() => guardDns(m, { ...record, content: "changed.example.com" })).toThrow();
  expect(() =>
    guardDns({ ...m, dns: { ...m.dns, desired: { ...record, type: "MX" } } }, record),
  ).toThrow();
});
test("manifest hash pins exact bytes", () => {
  expect(digest("{}")).not.toBe(digest("{}\n"));
});
test("missing credentials produce persisted failure, no network, release lock", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cloudflare-ops-"));
  const oldState = process.env.CLOUDFLARE_OPS_STATE;
  const oldToken = process.env.CLOUDFLARE_API_TOKEN_FILE;
  const originalFetch = globalThis.fetch;
  let network = false;
  try {
    process.env.CLOUDFLARE_OPS_STATE = dir + "/state";
    delete process.env.CLOUDFLARE_API_TOKEN_FILE;
    globalThis.fetch = Object.assign(
      () => {
        network = true;
        throw new Error("No network expected");
      },
      { preconnect: originalFetch.preconnect },
    );
    await Bun.write(dir + "/manifest.json", JSON.stringify(manifest));
    expect(await run(["reconcile", "--manifest", dir + "/manifest.json"])).toBe(1);
    expect(network).toBe(false);
    const state = await Bun.file(dir + "/state/latest.json").json();
    expect(state.authenticated).toBe(false);
    expect(state.status).toBe("failed");
    expect(await Bun.file(dir + "/state/last-success.json").exists()).toBe(false);
    expect(await run(["reconcile", "--manifest", dir + "/manifest.json"])).toBe(1);
    await expect(
      run([
        "dns",
        "--manifest",
        dir + "/manifest.json",
        "--apply",
        "--manifest-sha256",
        "0".repeat(64),
      ]),
    ).rejects.toThrow();
  } finally {
    globalThis.fetch = originalFetch;
    if (oldState === undefined) delete process.env.CLOUDFLARE_OPS_STATE;
    else process.env.CLOUDFLARE_OPS_STATE = oldState;
    if (oldToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN_FILE;
    else process.env.CLOUDFLARE_API_TOKEN_FILE = oldToken;
    await rm(dir, { recursive: true, force: true });
  }
});
test("credentials are read internally, reject permissive Unix mode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cloudflare-credential-"));
  try {
    const file = dir + "/token";
    await Bun.write(file, "fixture-no-real-secret");
    if (process.platform !== "win32") {
      await chmod(file, 0o644);
      await expect(readToken(file)).rejects.toThrow();
      await chmod(file, 0o600);
    }
    expect(await readToken(file)).toBe("fixture-no-real-secret");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("read-only reconciliation continues after worker failure and never logs credential", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cloudflare-audit-"));
  const oldState = process.env.CLOUDFLARE_OPS_STATE,
    oldToken = process.env.CLOUDFLARE_API_TOKEN_FILE;
  const originalFetch = globalThis.fetch;
  try {
    process.env.CLOUDFLARE_OPS_STATE = dir + "/state";
    process.env.CLOUDFLARE_API_TOKEN_FILE = dir + "/token";
    await Bun.write(dir + "/token", "fixture-no-real-secret");
    await chmod(dir + "/token", 0o600);
    await Bun.write(dir + "/manifest.json", JSON.stringify(manifest));
    globalThis.fetch = Object.assign(
      async (input: unknown, init?: RequestInit) => {
        expect(init?.method).toBe("GET");
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/deployments"))
          return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 });
        const result = path.endsWith("/r2/buckets")
          ? { buckets: [{ name: manifest.bucket }] }
          : path.includes("/zones/")
            ? { name: "example.com", status: "pending" }
            : path.includes("/cfd_tunnel/")
              ? { status: "inactive", connections: [] }
              : {};
        return Response.json({ success: true, result });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;
    expect(await run(["reconcile", "--manifest", dir + "/manifest.json"])).toBe(1);
    const state = await Bun.file(dir + "/state/latest.json").json();
    expect(state.worker.status).toBe("failed");
    expect(state.tunnel.status).toBe("inactive");
    expect(state.zone.status).toBe("pending");
    expect(state.migrate.copy_verified).toBe(false);
    expect(await Bun.file(dir + "/state/latest.json").text()).not.toContain(
      "fixture-no-real-secret",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (oldState === undefined) delete process.env.CLOUDFLARE_OPS_STATE;
    else process.env.CLOUDFLARE_OPS_STATE = oldState;
    if (oldToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN_FILE;
    else process.env.CLOUDFLARE_API_TOKEN_FILE = oldToken;
    await rm(dir, { recursive: true, force: true });
  }
});
import { command } from "./cloudflare-ops";
test("CLI credential reaches child environment without appearing in argv", async () => {
  await command(
    [
      process.execPath,
      "-e",
      "process.exit(process.env.CLOUDFLARE_API_TOKEN === 'fixture-no-real-secret' && !process.argv.some(arg => arg.includes('fixture-no-real-secret')) ? 0 : 1)",
    ],
    "fixture-no-real-secret",
  );
}, 60000);
