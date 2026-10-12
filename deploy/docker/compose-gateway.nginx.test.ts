// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";

const config = await Bun.file(new URL("./compose-gateway.nginx.conf", import.meta.url)).text();

test("static reader assets fall back to the pinned public CDN Worker", () => {
  expect(config).toContain("try_files $uri @cdn_worker;");
  expect(config).toContain("location @cdn_worker {");
  expect(config).toContain("proxy_pass https://shenron-cdn.aphrody-labs.workers.dev;");
  expect(config).toContain("proxy_ssl_server_name on;");
  expect(config).toContain("proxy_ssl_name shenron-cdn.aphrody-labs.workers.dev;");
  expect(config).toContain("proxy_pass_request_headers off;");
});

test("wiki image fallback does not intercept encyclopedia routes", () => {
  expect(config).toMatch(
    /location ~\* \^\/wiki\/\.\+\\\.\(\?:avif\|gif\|jpe\?g\|png\|svg\|webp\)\$/,
  );
  expect(config).toContain("location ^~ /wiki/media/ {");
  expect(config).toContain("location / {");
});
