// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createCrunchyrollAdminBridge, redactCrunchyrollError } from "../src/lib/crunchyroll-admin";

const request = (suffix = "") =>
  new Request(`https://dragonballfr.com/api/admin/video/crunchyroll/anime/G12345678${suffix}`);
test("site authorization runs before configuration or provider access", async () => {
  const bridge = createCrunchyrollAdminBridge({
    authorize: async () => false,
    configuration: () => {
      throw Error("must not load");
    },
  });
  const response = await bridge(request(), ["anime", "G12345678"]);
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
test("a site session and consumer password never manufacture provider application credentials", async () => {
  const bridge = createCrunchyrollAdminBridge({
    authorize: async () => true,
    configuration: () => ({ email: "owner@example.test", password: "private-value" }),
  });
  expect((await bridge(request(), ["anime", "G12345678"])).status).toBe(503);
  const status = await (await bridge(request(), ["status"])).json();
  expect(status.configured).toBe(false);
  expect(JSON.stringify(status)).not.toContain("private-value");
});
test("configured metadata uses requested locale and hides signatures, cookies and stream URLs", async () => {
  let observedLocale = "";
  const bridge = createCrunchyrollAdminBridge({
    authorize: async () => true,
    configuration: () => ({}),
    clientFactory: async (_signal, locale) => {
      observedLocale = locale;
      const data = async () => ({
        items: [
          {
            id: "G12345678",
            title: "Observed",
            access_token: "secret",
            streams_link: "https://secret.test",
            subtitle_locales: ["fr-FR", "en-US"],
          },
        ],
        signature: "secret",
        total: 1,
      });
      return { getAnime: data, getSeasons: data, getEpisodes: data, search: data };
    },
  });
  const response = await bridge(request("?lang=ja"), ["anime", "G12345678"]);
  expect(observedLocale).toBe("ja-JP");
  expect(await response.json()).toEqual({
    items: [{ id: "G12345678", title: "Observed", subtitle_locales: ["fr-FR", "en-US"] }],
    total: 1,
  });
  expect((await bridge(request("?lang=xx"), ["anime", "G12345678"])).status).toBe(400);
  expect((await bridge(request("?lang=toString"), ["anime", "G12345678"])).status).toBe(400);
  expect((await bridge(request(), ["https:", "evil.test"])).status).toBe(404);
});

test("upstream exceptions never disclose private provider messages", async () => {
  const bridge = createCrunchyrollAdminBridge({
    authorize: async () => true,
    configuration: () => ({}),
    clientFactory: async () => {
      throw new Error("private-upstream-token");
    },
  });
  const response = await bridge(request(), ["anime", "G12345678"]);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "upstream_failed" });
});

test("raw SDK errors lose token envelopes, signatures and unrecognized messages", () => {
  expect(
    redactCrunchyrollError({
      error: "upstream_failed",
      access_token: "secret",
      signature: "secret",
      message: "private-cookie",
    }),
  ).toEqual({ error: "upstream_failed" });
  expect(redactCrunchyrollError({ error: "private-token-value" })).toEqual({
    error: "upstream_failed",
  });
});
test("the linked current-user token takes precedence without mutating global configuration", async () => {
  const config = { accessToken: "deployment-token" };
  let calls = 0;
  const bridge = createCrunchyrollAdminBridge({
    authorize: async () => true,
    configuration: () => config,
    linkedAccessToken: async () => {
      calls++;
      return "linked-token";
    },
  });
  const response = await bridge(request(), ["status"]);
  expect((await response.json()).configured).toBe(true);
  expect(calls).toBe(1);
  expect(config.accessToken).toBe("deployment-token");
});
