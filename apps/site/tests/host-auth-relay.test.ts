// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { AUTH_RELAY_HEADER, proxyAuthToHost } from "../src/lib/host-auth";

test("an auth front pointing back to itself stops after one relay", async () => {
  let calls = 0;
  const front = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request): Promise<Response> {
      calls++;
      return proxyAuthToHost(request, front.url.origin);
    },
  });
  try {
    const response = await proxyAuthToHost(
      new Request("https://dragonballfr.com/api/auth/get-session"),
      front.url.origin,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "auth_unavailable" });
    expect(calls).toBe(1);
  } finally {
    await front.stop(true);
  }
});

test("auth forwarding preserves OAuth bytes, cookies and redirects without privileged headers", async () => {
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(await request.text()).toBe('{"provider":"discord"}');
      expect(request.headers.get("cookie")).toBe("session=synthetic");
      expect(request.headers.get(AUTH_RELAY_HEADER)).toBe("1");
      expect(request.headers.get("x-shenron-owner")).toBeNull();
      expect(request.headers.get("origin")).toBe("https://dragonballfr.com");
      return new Response(null, {
        status: 302,
        headers: {
          location: "https://discord.test/oauth",
          "set-cookie": "state=synthetic; HttpOnly; Secure",
        },
      });
    },
  });
  try {
    const response = await proxyAuthToHost(
      new Request("https://dragonballfr.com/api/auth/sign-in/social", {
        method: "POST",
        body: '{"provider":"discord"}',
        headers: {
          cookie: "session=synthetic",
          "content-type": "application/json",
          origin: "https://dragonballfr.com",
          "x-shenron-owner": "forged",
        },
      }),
      backend.url.origin,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://discord.test/oauth");
    expect(response.headers.get("set-cookie")).toBe("state=synthetic; HttpOnly; Secure");
  } finally {
    await backend.stop(true);
  }
});

test("a pending auth backend is cancelled by its caller or deadline", async () => {
  const backend = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Promise<Response>(() => {}),
  });
  try {
    await expect(
      proxyAuthToHost(
        new Request("https://dragonballfr.com/api/auth/get-session"),
        backend.url.origin,
        50,
      ),
    ).rejects.toBeDefined();
    const controller = new AbortController();
    const pending = proxyAuthToHost(
      new Request("https://dragonballfr.com/api/auth/get-session", { signal: controller.signal }),
      backend.url.origin,
    );
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  } finally {
    await backend.stop(true);
  }
});
