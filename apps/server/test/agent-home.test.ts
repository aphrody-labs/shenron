// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openAgentHomes } from "../src/agent-home";

const ID = "123456789012345678";
const roots: string[] = [];
const home = () => {
  const dir = mkdtempSync(join(tmpdir(), "shenron-server-agent-home-"));
  roots.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const loopback = "127.0.0.1";
const req = (path: string, init?: RequestInit) => {
  const request = new Request(`http://127.0.0.1:4100${path}`, init);
  return [request, new URL(request.url)] as const;
};

describe("agent homes of the desktop", () => {
  test("first start creates the anonymous local home with the system language", async () => {
    const env: Record<string, string | undefined> = {};
    const homes = openAgentHomes({ home: home() }, env, {
      system: { locale: "ja-JP", timeZone: "Asia/Tokyo" },
    });
    expect(homes.activeId()).toBe("local");
    expect(env.SHENRON_LOCAL_OWNER).toBe("local");
    expect(homes.active().profile).toMatchObject({ language: "ja", timezone: "Asia/Tokyo" });
    const dir = homes.dirOf("local")!;
    expect(existsSync(join(dir, "SOUL.md"))).toBe(true);
    expect(homes.memoryLocation("local")).toBe(join(dir, ".aphrody", "memory.sqlite"));
    expect(homes.memoryAliases(`discord:${ID}`)).toEqual(["local"]);
    expect(homes.dirOf(`discord:${ID}`)).toBeNull();
    expect(homes.dirOf("../etc")).toBeNull();
  });

  test("Discord sign-in through the loopback callback converts the local home", async () => {
    const root = home();
    const env: Record<string, string | undefined> = { NEXT_PUBLIC_SITE_URL: "https://site.test" };
    const opened: string[] = [];
    const verified: unknown[] = [];
    const homes = openAgentHomes({ home: root }, env, {
      openBrowser: (url) => opened.push(url),
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        verified.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return Response.json({
          discordId: ID,
          name: "Kakarot",
          avatarUrl: "https://cdn.discordapp.com/a.png",
          language: "en",
        });
      }) as typeof fetch,
    });
    // A memory written before the sign-in moves with the directory.
    writeFileSync(homes.memoryLocation("local"), "memories");

    const [login, loginUrl] = req("/api/local/agent-home/login", { method: "POST", body: "{}" });
    const started = await homes.handle(login, loginUrl, loopback);
    const { url } = (await started!.json()) as { url: string };
    expect(opened).toEqual([url]);
    const target = new URL(url);
    expect(target.pathname).toBe("/api/desktop/link");
    expect(target.searchParams.get("port")).toBe("4100");
    const state = target.searchParams.get("state")!;

    const [callback, callbackUrl] = req(`/api/local/agent-home/callback?state=${state}&code=abc`);
    const done = await homes.handle(callback, callbackUrl, loopback);
    expect(done!.status).toBe(302);
    expect(done!.headers.get("location")).toBe("http://127.0.0.1:4100/studio?agentHome=linked");
    expect(verified).toEqual([
      { url: expect.stringContaining("/api/desktop/link/verify"), body: { code: "abc", state } },
    ]);
    expect(homes.activeId()).toBe(`discord:${ID}`);
    expect(env.SHENRON_LOCAL_OWNER).toBe(`discord:${ID}`);
    expect(homes.active().profile).toMatchObject({ name: "Kakarot", language: "en" });
    expect(readFileSync(homes.memoryLocation(`discord:${ID}`), "utf8")).toBe("memories");
    expect(homes.dirOf("local")).toBeNull();

    // A replayed state is refused; a restart keeps the Discord home active.
    const replay = await homes.handle(callback, callbackUrl, loopback);
    expect(replay!.headers.get("location")).toContain("agentHome=expired");
    const again = openAgentHomes({ home: root }, {});
    expect(again.activeId()).toBe(`discord:${ID}`);
  });

  test("routes are loopback only and refuse foreign origins", async () => {
    const homes = openAgentHomes({ home: home() }, {}, { openBrowser: () => {} });
    const [get, getUrl] = req("/api/local/agent-home");
    expect((await homes.handle(get, getUrl, "10.0.0.2"))!.status).toBe(403);
    const [patch, patchUrl] = req("/api/local/agent-home", {
      method: "PATCH",
      headers: { origin: "https://evil.test" },
      body: JSON.stringify({ name: "x" }),
    });
    expect((await homes.handle(patch, patchUrl, loopback))!.status).toBe(403);
    const [ok, okUrl] = req("/api/local/agent-home", {
      method: "PATCH",
      body: JSON.stringify({ name: "Bulma", preferences: ["sans spoilers"], language: "fr" }),
    });
    const body = (await (await homes.handle(ok, okUrl, loopback))!.json()) as {
      profile: { name: string; preferences: string[] };
    };
    expect(body.profile).toMatchObject({ name: "Bulma", preferences: ["sans spoilers"] });
    const [other, otherUrl] = req("/api/local/health");
    expect(await homes.handle(other, otherUrl, loopback)).toBeNull();
  });

  test("the cached Bearer session is checked on the auth origin (host first, else the site)", async () => {
    const check = async (env: Record<string, string | undefined>, status: number) => {
      const root = home();
      mkdirSync(join(root, "config"), { recursive: true });
      writeFileSync(
        join(root, "config", "session"),
        JSON.stringify({ token: "tok", agentId: "local", savedAt: "2026-01-01T00:00:00Z" }),
      );
      const seen: { url: string; auth: string | null }[] = [];
      const homes = openAgentHomes({ home: root }, env, {
        fetch: (async (input: URL, init?: RequestInit) => {
          seen.push({
            url: String(input),
            auth: new Headers(init?.headers).get("authorization"),
          });
          return status === 200
            ? Response.json({ user: { id: "u" } })
            : new Response("", { status });
        }) as unknown as typeof fetch,
      });
      expect(homes.session()).toBe("cached");
      await homes.validated;
      return { seen, state: homes.session() };
    };
    const onHost = await check({ SHENRON_HOST_URL: "http://127.0.0.1:4100" }, 200);
    expect(onHost.seen).toEqual([
      { url: "http://127.0.0.1:4100/api/auth/get-session", auth: "Bearer tok" },
    ]);
    expect(onHost.state).toBe("valid");
    const onSite = await check({ NEXT_PUBLIC_SITE_URL: "https://site.test" }, 401);
    expect(onSite.seen[0]!.url).toBe("https://site.test/api/auth/get-session");
    expect(onSite.state).toBe("signedOut");
  });
});
