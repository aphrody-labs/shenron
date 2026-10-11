// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import "./setup";
import { createOpenAiChat } from "@aphrody/shenron-pipeline/aphrody/compute";
import { boundReply, DmChatGate, DmTimeoutError, withTimeout } from "~/lib/dm-chat";
import { createDmMemory } from "~/lib/dm-memory";
import { botLang, t } from "~/lib/i18n";
import en from "~/locales/en.json";
import fr from "~/locales/fr.json";
import ja from "~/locales/ja.json";

const limits = { concurrency: 2, queueMax: 2, userMessages: 3, userWindowMs: 60_000 };

describe("DmChatGate", () => {
  test("bounded concurrency, queue positions, slots handed over in order", async () => {
    const gate = new DmChatGate(limits);
    const a = gate.admit("a");
    const b = gate.admit("b");
    const c = gate.admit("c");
    const d = gate.admit("d");
    if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error("admitted");
    expect([a.ticket.position, b.ticket.position, c.ticket.position, d.ticket.position]).toEqual([
      0, 0, 1, 2,
    ]);
    expect(gate.active).toBe(2);
    expect(gate.admit("e")).toEqual({ ok: false, reason: "full" });
    a.ticket.release();
    await c.ticket.ready;
    expect(gate.active).toBe(2);
    expect(gate.waiting).toBe(1);
    c.ticket.release();
    c.ticket.release(); // idempotent
    await d.ticket.ready;
    b.ticket.release();
    d.ticket.release();
    expect(gate.active).toBe(0);
  });

  test("one request in flight per user, then a quota per window", () => {
    let now = 0;
    const gate = new DmChatGate(limits, () => now);
    const first = gate.admit("u");
    if (!first.ok) throw new Error("admitted");
    expect(gate.admit("u")).toEqual({ ok: false, reason: "busy" });
    first.ticket.release();
    for (let i = 0; i < 2; i++) {
      const next = gate.admit("u");
      if (!next.ok) throw new Error("admitted");
      next.ticket.release();
    }
    now = 10_000;
    expect(gate.admit("u")).toEqual({ ok: false, reason: "rate", retryMs: 50_000 });
    now = 60_001;
    expect(gate.admit("u").ok).toBe(true);
  });

  test("owners skip the quotas and go first in the queue", () => {
    const gate = new DmChatGate({ ...limits, queueMax: 0 });
    gate.admit("a");
    gate.admit("b");
    expect(gate.admit("c")).toEqual({ ok: false, reason: "full" });
    const owner = gate.admit("o", true);
    if (!owner.ok) throw new Error("admitted");
    expect(owner.ticket.position).toBe(1);
    const again = gate.admit("o", true);
    expect(again.ok).toBe(true);
  });

  test("a queued ticket released before its turn leaves the queue", async () => {
    const gate = new DmChatGate({ ...limits, concurrency: 1 });
    const a = gate.admit("a");
    const b = gate.admit("b");
    const c = gate.admit("c");
    if (!a.ok || !b.ok || !c.ok) throw new Error("admitted");
    b.ticket.release();
    expect(gate.waiting).toBe(1);
    a.ticket.release();
    await c.ticket.ready;
    expect(gate.active).toBe(1);
  });
});

describe("bounds", () => {
  test("boundReply keeps short text and cuts long text at a boundary", () => {
    expect(boundReply("  Bonjour.  ", 50)).toBe("Bonjour.");
    const long = `${"Goku est un Saiyan. ".repeat(20)}Fin`;
    const cut = boundReply(long, 200);
    expect(cut.length).toBeLessThanOrEqual(200);
    expect(cut.endsWith("…")).toBe(true);
  });

  test("withTimeout aborts the signal and rejects at the deadline", async () => {
    let aborted = false;
    const run = withTimeout(20, (signal) => {
      signal.addEventListener("abort", () => (aborted = true));
      return new Promise<string>(() => undefined);
    });
    await expect(run).rejects.toBeInstanceOf(DmTimeoutError);
    expect(aborted).toBe(true);
    expect(await withTimeout(1000, async () => "ok")).toBe("ok");
  });

  test("the direct chat server receives max_tokens", async () => {
    let body: Record<string, unknown> = {};
    const chat = createOpenAiChat(
      { baseUrl: new URL("http://127.0.0.1:1/v1"), model: "gemma4-e2b" },
      {
        maxTokens: 320,
        fetcher: (async (_url: unknown, init?: RequestInit) => {
          body = JSON.parse(String(init?.body));
          return Response.json({ choices: [{ message: { content: "ok" } }] });
        }) as typeof fetch,
      },
    );
    await chat([{ role: "user", content: "salut" }]);
    expect(body.max_tokens).toBe(320);
  });
});

describe("DM memory", () => {
  test("recalls relevant memories and stores only new facts", async () => {
    const rows: { id: string; content: string; tags: string[] }[] = [];
    const memory = createDmMemory(
      {
        list: () => rows.map((r) => ({ ...r, createdAt: new Date(0).toISOString(), metadata: {} })),
        add: (_agent, content, tags) => rows.push({ id: String(rows.length), content, tags }),
      },
      5,
    );
    expect(await memory.learn("discord:1", "J'adore Piccolo. Qui est Goku ?")).toBe(1);
    expect(await memory.learn("discord:1", "J'adore Piccolo.")).toBe(0);
    expect(await memory.recall("discord:1", "Parle-moi de Piccolo")).toContain("Piccolo");
  });
});

describe("bot dictionaries", () => {
  const keys = (o: object, p = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === "string" ? [`${p}${k}`] : keys(v as object, `${p}${k}.`),
    );

  test("en and ja are complete and placeholders match", () => {
    const ref = keys(fr).toSorted();
    expect(keys(en).toSorted()).toEqual(ref);
    expect(keys(ja).toSorted()).toEqual(ref);
    for (const key of ref) {
      const vars = (lang: "fr" | "en" | "ja") =>
        (t(lang, key as never).match(/\{\w+\}/g) ?? []).toSorted();
      expect(vars("en")).toEqual(vars("fr"));
      expect(vars("ja")).toEqual(vars("fr"));
    }
  });

  test("placeholders are replaced and locales resolved", () => {
    expect(t("en", "dm.queued", { position: 3 })).toContain("3");
    expect(botLang("ja-JP")).toBe("ja");
    expect(botLang("de")).toBe("fr");
  });
});
