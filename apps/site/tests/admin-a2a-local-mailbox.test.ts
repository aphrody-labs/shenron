import { afterAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("server-only", () => ({}));
mock.module("@/lib/session", () => ({
  getCurrentUser: async () => ({ user: { roleAdmin: true } }),
}));

const saved = { ...process.env };
const dir = mkdtempSync(join(tmpdir(), "admin-a2a-mailbox-"));
delete process.env.APHRODY_A2A_URL;
delete process.env.APHRODY_A2A_COORD_API;
delete process.env.A2A_COORD_DIR;
process.env = { ...process.env, NODE_ENV: "production" };
process.env.SHENRON_A2A_STORE_DIR = dir;

afterAll(() => {
  process.env = saved;
  rmSync(dir, { recursive: true, force: true });
});

const { GET } = await import("../src/app/api/admin/a2a/route");
const { appendFileEnvelope } =
  await import("../../../packages/pipeline/src/aphrody/a2a-file-store");

describe("admin A2A durable local mailbox", () => {
  test("reads the real production store without a retired upstream", async () => {
    await appendFileEnvelope({
      v: 1,
      id: "admin-mailbox-fixture",
      ts: "2026-10-13T12:00:00.000Z",
      from: "fixture",
      to: "codex",
      kind: "fact",
      topic: "fixture.read",
      body: "Hermetic mailbox fixture",
    });
    const response = await GET(new Request("https://dragonballfr.com/api/admin/a2a"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.envelopes[0].id).toBe("admin-mailbox-fixture");
    expect(typeof body.fetchedAt).toBe("string");
  });
});
