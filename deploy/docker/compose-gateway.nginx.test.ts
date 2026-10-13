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

test("CDN quota failures use the private public-image origin without browser credentials", async () => {
  for (const source of [
    config,
    await Bun.file(new URL("./cdn-dragonballfr-ssl.conf", import.meta.url)).text(),
  ]) {
    expect(source).toContain("error_page 404 429 500 502 503 504 = @cdn_public_origin;");
    const origin = source.match(/location @cdn_public_origin \{([^}]+)\}/)?.[1];
    expect(origin).toContain("proxy_pass_request_headers off;");
    expect(origin).toContain("proxy_set_header Host shenron-cdn-origin.internal;");
    expect(origin).not.toContain("$http_cookie");
    expect(origin).not.toContain("$http_authorization");
  }
});

test("CDN chunks prefer the sealed rolling tree and use the active site on a miss", async () => {
  const source = await Bun.file(new URL("./cdn-dragonballfr-ssl.conf", import.meta.url)).text();
  expect(source).toContain("try_files $uri @release_static;");
  expect(source).toContain("root /srv/shenron-cdn;");
  expect(source).toContain("location @release_static {");
  expect(source).toContain("proxy_pass http://127.0.0.1:5011;");
});
