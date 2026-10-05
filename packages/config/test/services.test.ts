// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  resolveBotApiInternalUrl,
  resolveBotApiServerUrl,
  resolveRedisUrl,
  resolveRelectureOcrUrl,
  resolveShenronApiBind,
  resolveSiteInternalUrl,
} from "../src/services";

describe("internal service resolvers", () => {
  test("defaults", () => {
    expect(resolveRedisUrl({})).toBe("redis://127.0.0.1:6379");
    expect(resolveSiteInternalUrl({})).toBe("http://127.0.0.1:5011");
    expect(resolveBotApiInternalUrl({})).toBe("http://127.0.0.1:5006");
    expect(resolveRelectureOcrUrl({})).toBe("http://127.0.0.1:8791");
  });
  test("historical names and order", () => {
    expect(resolveRedisUrl({ VALKEY_URL: "redis://v:1" })).toBe("redis://v:1");
    expect(resolveRedisUrl({ REDIS_URL: "redis://r:1", VALKEY_URL: "redis://v:1" })).toBe(
      "redis://r:1",
    );
    expect(resolveRedisUrl({ REDIS_URL: " ", VALKEY_URL: "redis://v:1" })).toBe("redis://v:1");
    expect(resolveSiteInternalUrl({ SITE_INTERNAL_URL: "http://s:1/" })).toBe("http://s:1");
    expect(resolveBotApiInternalUrl({ API_HOST: "0.0.0.0", API_PORT: "7000" })).toBe(
      "http://0.0.0.0:7000",
    );
    expect(resolveBotApiInternalUrl({ API_HOST: "::1" })).toBe("http://[::1]:5006");
  });
  test("bot API for site server calls: BOT_INTERNAL_URL, then the public API URL", () => {
    expect(resolveBotApiServerUrl({})).toBe("https://bot.dragonballfr.com");
    expect(resolveBotApiServerUrl({ BOT_INTERNAL_URL: "http://127.0.0.1:5006/" })).toBe(
      "http://127.0.0.1:5006",
    );
    expect(
      resolveBotApiServerUrl({ BOT_INTERNAL_URL: " ", NEXT_PUBLIC_SHENRON_API_URL: "https://a/" }),
    ).toBe("https://a");
    expect(
      resolveBotApiServerUrl({ NEXT_PUBLIC_SHENRON_API_URL: "", SHENRON_API_URL: "https://b" }),
    ).toBe("https://b");
  });
  test("Shenron API bind: loopback default, invalid port ignored", () => {
    expect(resolveShenronApiBind({})).toEqual({ hostname: "127.0.0.1", port: 8797 });
    expect(
      resolveShenronApiBind({ SHENRON_API_HOST: "0.0.0.0", SHENRON_API_PORT: "9000" }),
    ).toEqual({
      hostname: "0.0.0.0",
      port: 9000,
    });
    expect(resolveShenronApiBind({ SHENRON_API_PORT: "http" }).port).toBe(8797);
    expect(resolveShenronApiBind({ SHENRON_API_PORT: "70000" }).port).toBe(8797);
  });
});
