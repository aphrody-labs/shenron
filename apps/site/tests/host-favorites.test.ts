import { afterAll, expect, mock, test } from "bun:test";

mock.module("@/lib/db", () => {
  throw new Error("Next must not initialize favorites storage");
});
mock.module("@/lib/session", () => {
  throw new Error("Next must not resolve favorites identity");
});
const { GET, PUT } = await import("../src/app/api/favorites/route");
const previous = process.env.SHENRON_HOST_URL;
let status = 200;
let observed: {
  method: string;
  cookie: string | null;
  authorization: string | null;
  body?: unknown;
};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    observed = {
      method: request.method,
      cookie: request.headers.get("cookie"),
      authorization: request.headers.get("authorization"),
      body: request.method === "POST" ? await request.json() : undefined,
    };
    return Response.json(
      status === 200
        ? request.method === "POST"
          ? { ok: true, count: 1 }
          : { favorites: [] }
        : { error: "Unavailable" },
      { status },
    );
  },
});
process.env.SHENRON_HOST_URL = server.url.toString();
afterAll(async () => {
  if (previous === undefined) delete process.env.SHENRON_HOST_URL;
  else process.env.SHENRON_HOST_URL = previous;
  await server.stop(true);
});

test("Next streams favorites to Bun with credentials and preserves backend failures", async () => {
  const request = new Request("http://site/api/favorites", {
    method: "PUT",
    headers: {
      cookie: "fixture=reader",
      authorization: "Bearer reader-fixture",
      "content-type": "application/json",
    },
    body: JSON.stringify({ favorites: [{ id: "7" }] }),
  });
  const response = await PUT(request as Parameters<typeof PUT>[0]);
  expect(await response.json()).toEqual({ ok: true, count: 1 });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(observed!).toMatchObject({
    method: "POST",
    cookie: "fixture=reader",
    authorization: "Bearer reader-fixture",
    body: { favorites: [{ id: "7" }] },
  });
  status = 503;
  expect(
    (await GET(new Request("http://site/api/favorites") as Parameters<typeof GET>[0])).status,
  ).toBe(503);
  delete process.env.SHENRON_HOST_URL;
  expect(
    (await GET(new Request("http://site/api/favorites") as Parameters<typeof GET>[0])).status,
  ).toBe(503);
});
