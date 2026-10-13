// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";

const source = (await Bun.file(new URL("../src/api/server.ts", import.meta.url)).text()).replaceAll(
  "\r\n",
  "\n",
);
const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Execute the production route closure with isolated ports, without starting a bot or a database.
const scan = source.slice(
  source.indexOf('"/api/public/profile/:discordId/scan.png"'),
  source.indexOf("// ── A2A"),
);
const body = /async \(\) => \{([\s\S]*?)\n {12}\},\n {12}3600/.exec(scan)?.[1];
if (!body) throw new Error("Public scan route closure was not found");
const buildScan = new Function(
  "container",
  "HttpError",
  "DatabaseService",
  "GaugeService",
  "eq",
  "users",
  "xpAccent",
  "req",
  transpiler.transformSync(`const render = async () => {${body}};`) + "return render;",
);

test("a missing bot profile returns 404 before the scan renderer can invent a zero-XP image", async () => {
  let rendered = 0;
  const container = {
    resolve: (token: string) =>
      token === "ClientMap"
        ? new Map([["shenron", { users: { fetch: async () => ({ id: "853295213473038376" }) } }]])
        : token === "database"
          ? { db: { query: { users: { findFirst: async () => undefined } } } }
          : {
              render: async () => {
                rendered++;
              },
            },
  };
  const render = buildScan(
    container,
    HttpError,
    "database",
    "gauge",
    () => null,
    { id: "id" },
    () => "#ffffff",
    { params: { discordId: "853295213473038376" } },
  );
  const error = await render().catch((value: unknown) => value);
  expect(error).toBeInstanceOf(HttpError);
  expect(error.status).toBe(404);
  expect(rendered).toBe(0);
});

const wrapper = source.slice(
  source.indexOf("async function publicCachedImage("),
  source.indexOf("/**\n * Aplatit", source.indexOf("async function publicCachedImage(")),
);
const buildWrapper = new Function(
  "publicCorsHeaders",
  "publicRateLimit",
  "clientIp",
  "cachedImage",
  transpiler.transformSync(wrapper) + "return publicCachedImage;",
);
test("public canvas failures remain JSON errors and never enter the public CDN cache", async () => {
  for (const status of [404, 500]) {
    const handler = buildWrapper(
      () => ({ "Access-Control-Allow-Origin": "*" }),
      () => true,
      () => "test",
      async () => Response.json({ error: "Unavailable" }, { status }),
    );
    const response = await handler(
      new Request("https://bot.dragonballfr.com/example"),
      async () => new Uint8Array(),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Unavailable" });
  }
  const success = buildWrapper(
    () => ({}),
    () => true,
    () => "test",
    async () => new Response(null, { status: 304 }),
  );
  expect(
    (
      await success(
        new Request("https://bot.dragonballfr.com/example"),
        async () => new Uint8Array(),
      )
    ).headers.get("Cache-Control"),
  ).toContain("public,");
});
