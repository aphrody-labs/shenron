// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  VfsInfoResponse,
  VfsListResponse,
  VfsQueryResponse,
  VfsStatResponse,
} from "../src/contract";
import { createShenronApi } from "../src/server";
import { basePorts, expectApiError, fakeVfs, VFS_INFO } from "./support/ports";

const ADMIN = { "x-test-admin": "1" } as const;

function setup(o: Parameters<typeof fakeVfs>[0] = {}) {
  const vfs = fakeVfs(o);
  const api = createShenronApi(basePorts({ vfs: vfs.port }), { service: "shenron-server" });
  return { api, calls: vfs.calls };
}

const at = (route: string, path: string) => `/api/v1/vfs/${route}?path=${encodeURIComponent(path)}`;

describe("vfs group: routing", () => {
  test("GET routes and the admin POST; other methods → 404; no port → nothing claimed", async () => {
    const { api } = setup();
    for (const path of ["/api/v1/vfs", "/api/v1/vfs/stat", "/api/v1/vfs/list", "/api/v1/vfs/file"])
      expect(api.handles(path)).toBe(true);
    for (const [method, path] of [
      ["POST", "/api/v1/vfs"],
      ["POST", at("file", "/wiki/goku.md")],
      ["GET", "/api/v1/vfs/query"],
    ] as const) {
      const res = await api.request(path, { method });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
    const none = createShenronApi(basePorts({ vfs: null }), { service: "shenron-server" });
    expect(none.handles("/api/v1/vfs/stat")).toBe(false);
  });

  test("path is required (1 to 4096 characters)", async () => {
    const { api, calls } = setup();
    for (const route of ["stat", "list", "file"]) {
      for (const query of ["", "?path=", `?path=${"a".repeat(4097)}`]) {
        await expectApiError(await api.request(`/api/v1/vfs/${route}${query}`), {
          path: `/api/v1/vfs/${route}`,
          method: "get",
          status: 400,
          code: "invalid_request",
        });
      }
    }
    expect(calls).toEqual([]);
  });
});

describe("vfs group: info, stat, list", () => {
  test("info: public JSON cached 60 s, revalidated with 304", async () => {
    const { api, calls } = setup();
    const first = await api.request("/api/v1/vfs");
    expect(first.status).toBe(200);
    expect(VfsInfoResponse.parse(await first.json())).toEqual(VFS_INFO);
    expect(first.headers.get("cache-control")).toBe(
      "public, max-age=60, s-maxage=120, stale-while-revalidate=240",
    );
    const etag = first.headers.get("etag")!;
    const again = await api.request("/api/v1/vfs", { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect(calls).toEqual(["info"]);
  });

  // Regression: a VFS that could not be read answered a generic 500 on /api/v1/vfs only.
  test("info: an unreadable VFS → 503 pg_unavailable without the cause", async () => {
    const { api } = setup({ failInfo: true });
    const body = await expectApiError(await api.request("/api/v1/vfs"), {
      path: "/api/v1/vfs",
      method: "get",
      status: 503,
      code: "pg_unavailable",
    });
    expect(JSON.stringify(body)).not.toContain("/srv/private");
  });

  test("stat: node metadata with its path; missing → 404, invalid → 400", async () => {
    const { api } = setup();
    const res = await api.request(at("stat", "/wiki/goku.md"));
    expect(res.status).toBe(200);
    expect(VfsStatResponse.parse(await res.json())).toMatchObject({
      path: "/wiki/goku.md",
      kind: "file",
      sha256: "aa11",
      visibility: "public",
    });
    const missing = await api.request(at("stat", "/wiki/vegeta.md"));
    expect(
      await expectApiError(missing, { path: "/api/v1/vfs/stat", method: "get", status: 404 }),
    ).toEqual({ error: "Not found" });
    const invalid = await api.request(at("stat", "wiki"));
    expect(
      await expectApiError(invalid, {
        path: "/api/v1/vfs/stat",
        method: "get",
        status: 400,
        code: "invalid_request",
      }),
    ).toEqual({ error: "invalid VFS path wiki", code: "invalid_request" });
  });

  test("list: directory entries; a file → 400 invalid_request", async () => {
    const { api } = setup();
    const res = await api.request(at("list", "/wiki"));
    expect(VfsListResponse.parse(await res.json()).entries.map((e) => e.name)).toEqual([
      "goku.md",
      "secret.md",
      "raw.bin",
    ]);
    await expectApiError(await api.request(at("list", "/wiki/goku.md")), {
      path: "/api/v1/vfs/list",
      method: "get",
      status: 400,
      code: "invalid_request",
    });
  });

  test("public profile: private nodes are 404 and hidden from listings", async () => {
    const { api } = setup({ publicOnly: true });
    for (const route of ["stat", "file"]) {
      expect(
        await expectApiError(await api.request(at(route, "/wiki/secret.md")), {
          path: `/api/v1/vfs/${route}`,
          method: "get",
          status: 404,
          code: "not_found",
        }),
      ).toEqual({ error: "Not found", code: "not_found" });
    }
    await expectApiError(await api.request(at("list", "/private")), {
      path: "/api/v1/vfs/list",
      method: "get",
      status: 404,
    });
    const wiki = VfsListResponse.parse(await (await api.request(at("list", "/wiki"))).json());
    expect(wiki.entries.map((e) => e.name)).toEqual(["goku.md", "raw.bin"]);
    const root = VfsListResponse.parse(await (await api.request(at("list", "/"))).json());
    expect(root.entries.map((e) => e.name)).toEqual(["wiki"]);
  });
});

describe("vfs group: file", () => {
  test("bytes with the node MIME type, a day of public cache and the sha256 ETag", async () => {
    const { api, calls } = setup();
    const res = await api.request(at("file", "/wiki/goku.md"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("# Son Goku\n");
    expect(res.headers.get("content-type")).toBe("text/markdown");
    expect(res.headers.get("etag")).toBe('"aa11"');
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=86400, s-maxage=172800, stale-while-revalidate=345600",
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://dragonballfr.com");
    // Binary answers stay out of the JSON public cache: every request reads the VFS.
    const conditional = await api.request(at("file", "/wiki/goku.md"), {
      headers: { "if-none-match": '"aa11"' },
    });
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
    expect(conditional.headers.get("etag")).toBe('"aa11"');
    expect(calls.filter((c) => c === "read:/wiki/goku.md")).toHaveLength(1);
    expect(calls.filter((c) => c === "stat:/wiki/goku.md")).toHaveLength(2);
  });

  test("HEAD: headers only; a node without hash has no ETag", async () => {
    const { api } = setup();
    const head = await api.request(at("file", "/wiki/goku.md"), { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("etag")).toBe('"aa11"');
    expect(await head.text()).toBe("");
    const raw = await api.request(at("file", "/wiki/raw.bin"));
    expect(raw.headers.get("etag")).toBeNull();
    expect(await raw.text()).toBe("raw");
  });

  test("a local file is served without reading the VFS bytes", async () => {
    const { api, calls } = setup({ local: true });
    const res = await api.request(at("file", "/wiki/goku.md"));
    expect(await res.text()).toBe("# Son Goku\n");
    expect(res.headers.get("content-type")).toBe("text/markdown");
    expect(calls).toContain("local:/wiki/goku.md");
    expect(calls).not.toContain("read:/wiki/goku.md");
  });

  test("a directory → 400 not a file; a missing node → 404", async () => {
    const { api } = setup();
    expect(
      await expectApiError(await api.request(at("file", "/wiki")), {
        path: "/api/v1/vfs/file",
        method: "get",
        status: 400,
        code: "invalid_request",
      }),
    ).toEqual({ error: "not a file", code: "invalid_request" });
    await expectApiError(await api.request(at("file", "/wiki/vegeta.md")), {
      path: "/api/v1/vfs/file",
      method: "get",
      status: 404,
    });
  });
});

const query = (body: unknown, headers: Record<string, string> = ADMIN): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

describe("vfs group: admin query", () => {
  test("administrator only: 403 forbidden otherwise, the port is never reached", async () => {
    const { api, calls } = setup();
    for (const headers of [{}, { "x-test-owner": "alice" }, { "x-test-admin": "0" }] as Record<
      string,
      string
    >[]) {
      await expectApiError(
        await api.request("/api/v1/vfs/query", query({ sql: "select 1" }, headers)),
        {
          path: "/api/v1/vfs/query",
          method: "post",
          status: 403,
          code: "forbidden",
        },
      );
    }
    const noAuth = createShenronApi(basePorts({ vfs: fakeVfs().port, auth: null }), {
      service: "shenron-server",
    });
    await expectApiError(await noAuth.request("/api/v1/vfs/query", query({ sql: "select 1" })), {
      path: "/api/v1/vfs/query",
      method: "post",
      status: 403,
    });
    expect(calls).toEqual([]);
  });

  test("rows and duration; SQL errors → 400 with the message; body validated", async () => {
    const { api } = setup();
    const res = await api.request(
      "/api/v1/vfs/query",
      query({ sql: "select * from nodes where path = ?", params: ["/wiki"] }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = VfsQueryResponse.parse(await res.json());
    expect(body.rows).toEqual([{ sql: "select * from nodes where path = ?", params: 1 }]);
    expect(
      await expectApiError(await api.request("/api/v1/vfs/query", query({ sql: "boom" })), {
        path: "/api/v1/vfs/query",
        method: "post",
        status: 400,
      }),
    ).toEqual({ error: 'near "boom": syntax error', code: "invalid_request" });
    for (const bad of [{}, { sql: "" }, { sql: "x", params: [{}] }]) {
      await expectApiError(await api.request("/api/v1/vfs/query", query(bad)), {
        path: "/api/v1/vfs/query",
        method: "post",
        status: 400,
        code: "invalid_request",
      });
    }
  });
});
