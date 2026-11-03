// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { patchWikiUploadGateway, WIKI_UPLOAD_FALLBACK } from "./wiki-upload-gateway";

const current =
  "server { location @cdn_worker {\n proxy_pass http://127.0.0.1:9077;\n proxy_pass_request_headers off;\n proxy_intercept_errors off;\n} }";
test("current production gateway gains one credential-free fallback per server and remains idempotent", () => {
  const result = patchWikiUploadGateway(`${current}\n${current}`);
  expect(result.changes).toBe(2);
  expect(result.config.match(/error_page 404 = @persistent_wiki_upload;/g)).toHaveLength(2);
  expect(result.config).not.toContain("proxy_intercept_errors off;");
  expect(patchWikiUploadGateway(result.config)).toEqual({ config: result.config, changes: 0 });
});
test("fallback only permits generated images and forwards no cookies or authorization", () => {
  expect(WIKI_UPLOAD_FALLBACK).toContain("proxy_pass_request_headers off;");
  expect(WIKI_UPLOAD_FALLBACK).toContain("proxy_hide_header Set-Cookie;");
  expect(WIKI_UPLOAD_FALLBACK).toContain('if ($request_method !~ "^(GET|HEAD)$") { return 405; }');
  expect(WIKI_UPLOAD_FALLBACK).toContain("proxy_pass http://upstream_bot;");
  expect(WIKI_UPLOAD_FALLBACK).not.toMatch(/http_cookie|http_authorization|\.sqlite/);
  const expression = WIKI_UPLOAD_FALLBACK.match(/if \(\$uri !~ "(.*)"\)/)![1]!;
  const allowed = new RegExp(expression);
  expect(
    allowed.test("/assets/wiki/media-validation/9ef95580-4a8e-45ed-a3ab-113e191b2dcc.webp"),
  ).toBe(true);
  for (const path of [
    "/api/admin",
    "/assets/wiki/.env",
    "/assets/manga/page.jpg",
    "/assets/wiki/../../secret.png",
    "/assets/wiki/foo/test.html",
  ])
    expect(allowed.test(path)).toBe(false);
});
test("an unexpected source or a half-installed fallback is rejected", () => {
  expect(() => patchWikiUploadGateway("server {} ")).toThrow();
  expect(() => patchWikiUploadGateway(current.replace("9077", "9999"))).toThrow();
  expect(() => patchWikiUploadGateway("location @persistent_wiki_upload {} ")).toThrow();
});

test("existing production security guards and quoted regex braces survive the patch", () => {
  const guarded = current.replace(
    "proxy_pass",
    'if ($uri !~ "^/assets/[a-f0-9]{64}\\.png$") { return 404; }\n # leave { this } comment untouched\n proxy_pass',
  );
  const result = patchWikiUploadGateway(guarded);
  expect(result.changes).toBe(1);
  expect(result.config).toContain('if ($uri !~ "^/assets/[a-f0-9]{64}\\.png$") { return 404; }');
  expect(result.config).toContain("# leave { this } comment untouched");
});
