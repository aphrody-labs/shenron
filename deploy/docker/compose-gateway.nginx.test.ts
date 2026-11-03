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

test("missing CDN assets fall through to the Shenron VFS without exposing its database", () => {
  const assetsRoute = config.match(/location \/assets\/ \{([^}]+)\}/)?.[1] ?? "";
  const assetsWorker = config.match(/location @cdn_worker_assets \{([^}]+)\}/)?.[1] ?? "";
  const origin = config.match(/location @cdn_public_origin_assets \{([^}]+)\}/)?.[1] ?? "";
  const vfs = config.match(/location @vfs_asset \{([^}]+)\}/)?.[1] ?? "";
  const genericOrigin = config.match(/location @cdn_public_origin \{([^}]+)\}/)?.[1] ?? "";
  expect(assetsRoute).toContain("try_files $uri @cdn_worker_assets;");
  expect(assetsWorker).toContain("error_page 404 429 500 502 503 504 = @cdn_public_origin_assets;");
  expect(origin).toContain("proxy_intercept_errors on;");
  expect(origin).toContain("error_page 404 = @vfs_asset;");
  expect(vfs).toContain("proxy_pass http://upstream_site;");
  expect(vfs).toContain("proxy_pass_request_headers off;");
  expect(vfs).not.toContain("shenron-vfs.sqlite");
  expect(vfs).not.toContain("$http_cookie");
  expect(vfs).not.toContain("$http_authorization");
  expect(genericOrigin).not.toContain("@vfs_asset");
  expect(config).not.toContain("/var/lib/shenron/data");
});

test("new persistent wiki uploads remain readable after CDN and VFS misses without credentials", () => {
  const vfs = config.match(/location @vfs_asset \{([^}]+)\}/)?.[1] ?? "";
  expect(vfs).toContain("error_page 404 = @persistent_wiki_upload;");
  const upload = config.slice(
    config.indexOf("location @persistent_wiki_upload"),
    config.indexOf("location @cdn_worker {"),
  );
  expect(upload).toContain("proxy_pass http://upstream_bot;");
  expect(upload).toContain("proxy_pass_request_headers off;");
  expect(upload).toContain("proxy_hide_header Set-Cookie;");
  expect(upload).not.toContain("$http_cookie");
  expect(upload).not.toContain("$http_authorization");
});

test("CDN chunks prefer the sealed rolling tree and use the active site on a miss", async () => {
  const source = await Bun.file(new URL("./cdn-dragonballfr-ssl.conf", import.meta.url)).text();
  expect(source).toContain("try_files $uri @release_static;");
  expect(source).toContain("root /srv/shenron-cdn;");
  expect(source).toContain("location @release_static {");
  expect(source).toContain("proxy_pass http://127.0.0.1:5011;");
  expect(source).toContain("error_page 404 502 503 504 = @cdn_native_chunk;");
  const retained = source.match(/location @cdn_native_chunk \{([^}]+)\}/)?.[1];
  expect(retained).toContain("proxy_pass http://127.0.0.1:9077;");
  expect(retained).toContain("proxy_pass_request_headers off;");
  expect(retained).not.toContain("$http_cookie");
  expect(retained).not.toContain("$http_authorization");
});

test("CDN serves public CPK requests through the site API without browser credentials", () => {
  const routeBlocks = [
    ...config.matchAll(/location (?:=|\^~) \/api\/public\/dbxv2\/cpk\/? \{([^}]+)\}/g),
  ];
  expect(routeBlocks).toHaveLength(4);
  for (const [, block = ""] of routeBlocks) {
    expect(block).toContain("proxy_pass http://upstream_site");
    expect(block).toContain("proxy_set_header Host dragonballfr.com;");
    expect(block).toContain('proxy_set_header Cookie "";');
    expect(block).toContain('proxy_set_header Authorization "";');
    expect(block).toContain("proxy_set_header Range $http_range;");
    expect(block).toContain("proxy_buffering off;");
  }
});
