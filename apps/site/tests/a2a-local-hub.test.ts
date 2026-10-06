/**
 * `/api/a2a` without `APHRODY_A2A_URL`: the in-process Shenron hub answers (A2A 1.0 and the
 * legacy dialect), reads are public, writes need a token or an admin IP.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("server-only", () => ({}));

const dir = mkdtempSync(join(tmpdir(), "site-a2a-local-"));
const saved = { ...process.env };
const ADMIN = "site-a2a-local-admin-token-0123";

beforeAll(() => {
  delete process.env.APHRODY_A2A_URL;
  delete process.env.APHRODY_A2A_COORD_API;
  delete process.env.SHENRON_A2A_ENFORCE;
  delete process.env.DATABOOKS_API_TOKEN;
  process.env.SHENRON_A2A_STORE_DIR = dir;
  process.env.SHENRON_ADMIN_TOKEN = ADMIN;
  process.env.SHENRON_ADMIN_IPS = "";
});
afterAll(() => {
  process.env = saved;
  rmSync(dir, { recursive: true, force: true });
});

const route = () => import("../src/app/api/a2a/route");
const rpc = (method: string, params: unknown, headers: Record<string, string> = {}) =>
  new Request("https://dragonballfr.com/api/a2a", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

describe("/api/a2a in-process hub", () => {
  test("the card is the hub card with a JSON-RPC 1.0 interface", async () => {
    const { GET } = await route();
    const res = await GET(new Request("https://dragonballfr.com/api/a2a"));
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.name).toBe("shenron-dragonball");
    expect(card.supportedInterfaces[0].protocolVersion).toBe("1.0");
  });

  test("an anonymous write is refused, an admin one creates a task readable by anyone", async () => {
    const { POST } = await route();
    const message = {
      message: { messageId: "m1", role: "ROLE_USER", parts: [{ text: "@agycli: ping" }] },
    };
    expect((await POST(rpc("SendMessage", message))).status).toBe(401);
    const sent = await POST(rpc("SendMessage", message, { authorization: `Bearer ${ADMIN}` }));
    expect(sent.status).toBe(200);
    const task = (await sent.json()).result.task;
    expect(task.status.state).toBe("TASK_STATE_SUBMITTED");
    const got = await POST(rpc("GetTask", { id: task.id }));
    expect(got.status).toBe(200);
    expect((await got.json()).result.id).toBe(task.id);
    const legacy = await POST(rpc("tasks/get", { taskId: task.id }));
    expect((await legacy.json()).result.target).toBe("agycli");
  });
});
