// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Opt-in integration: a real disposable Nginx instance, isolated stub upstreams, no production writes.
test.if(process.env.SHENRON_GAME_INGRESS_TEST === "1")(
  "game hosts forward bounded public GETs and ranges without credentials",
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "shenron-game-hosts-"));
    const name = `shenron-game-hosts-${process.pid}-${Date.now()}`;
    const received: { path: string; headers: Record<string, string> }[] = [];
    const api = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        const value = {
          path: new URL(request.url).pathname,
          headers: Object.fromEntries(request.headers),
        };
        received.push(value);
        return Response.json(value, { headers: { "Set-Cookie": "private-fixture=discard" } });
      },
    });
    const game = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("game-process"),
    });
    const reserveHttp = Bun.serve({ port: 0, fetch: () => new Response() });
    const reserveTls = Bun.serve({ port: 0, fetch: () => new Response() });
    const httpPort = reserveHttp.port!;
    const tlsPort = reserveTls.port!;
    reserveHttp.stop(true);
    reserveTls.stop(true);
    const run = async (command: string[]) => {
      const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
      const [out, error, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (code !== 0) throw new Error(error);
      return out;
    };
    try {
      await run([
        "openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=play.dragonballfr.com",
        "-keyout",
        join(directory, "key.pem"),
        "-out",
        join(directory, "cert.pem"),
      ]);
      const original = await Bun.file(new URL("./game-hosts.nginx.conf", import.meta.url)).text();
      const config = original
        .replaceAll("127.0.0.1:5011", `127.0.0.1:${api.port}`)
        .replaceAll("127.0.0.1:5013", `127.0.0.1:${game.port}`)
        .replaceAll("listen 80;", `listen ${httpPort};`)
        .replaceAll("listen [::]:80;", `listen [::]:${httpPort};`)
        .replaceAll("listen 443 ssl;", `listen ${tlsPort} ssl;`)
        .replaceAll("listen [::]:443 ssl;", `listen [::]:${tlsPort} ssl;`)
        .replaceAll("/etc/letsencrypt/live/dragonballfr-game/fullchain.pem", "/test/cert.pem")
        .replaceAll("/etc/letsencrypt/live/dragonballfr-game/privkey.pem", "/test/key.pem");
      await Bun.write(join(directory, "hosts.conf"), config);
      await Bun.write(
        join(directory, "nginx.conf"),
        "events {}\nhttp { include /etc/nginx/mime.types; include /test/hosts.conf; }\n",
      );
      await run([
        "docker",
        "run",
        "--rm",
        "-d",
        "--name",
        name,
        "--network",
        "host",
        "--mount",
        `type=bind,source=${directory},target=/test,readonly`,
        "nginx:alpine",
        "nginx",
        "-c",
        "/test/nginx.conf",
        "-g",
        "daemon off;",
      ]);
      const request = (host: string, path: string, method = "GET") =>
        fetch(`https://127.0.0.1:${tlsPort}${path}`, {
          method,
          redirect: "manual",
          tls: { rejectUnauthorized: false },
          headers: {
            Host: host,
            Cookie: "private-fixture=discard",
            Authorization: "Bearer private-fixture",
            "X-Api-Key": "private-fixture",
            Range: "bytes=0-15",
            "If-Range": '"etag-fixture"',
          },
        });
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          await request("game-api.dragonballfr.com", "/api/catalog");
          ready = true;
          break;
        } catch {
          await Bun.sleep(50);
        }
      }
      expect(ready).toBe(true);
      for (const host of ["play.dragonballfr.com", "game-api.dragonballfr.com"]) {
        for (const path of [
          "/api/catalog",
          "/api/public/dbxv2/cpk",
          "/api/public/dbxv2/cpk/data/raw/data/stage/BFlbn.map",
        ]) {
          const response = await request(host, path);
          expect(response.status).toBe(200);
          expect(response.headers.get("Set-Cookie")).toBeNull();
          const result = (await response.json()) as {
            path: string;
            headers: Record<string, string>;
          };
          expect(result.path).toBe(path);
          expect(result.headers.range).toBe("bytes=0-15");
          expect(result.headers["if-range"]).toBe('"etag-fixture"');
          expect(result.headers.cookie).toBeUndefined();
          expect(result.headers.authorization).toBeUndefined();
          expect(result.headers["x-api-key"]).toBeUndefined();
        }
        expect((await request(host, "/api/catalog", "POST")).status).toBe(405);
        expect((await request(host, "/api/private")).status).toBe(404);
      }
      expect((await request("play.dragonballfr.com", "/")).status).toBe(200);
      expect((await request("game-api.dragonballfr.com", "/admin")).status).toBe(404);
      expect(received.length).toBeGreaterThanOrEqual(6);
    } finally {
      await run(["docker", "rm", "-f", name]).catch(() => {});
      api.stop(true);
      game.stop(true);
      rmSync(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
