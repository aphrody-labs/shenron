// SPDX-License-Identifier: Apache-2.0
/** Public reads of newly uploaded files reuse the bot's persistent writer after the CDN misses. */
export const WIKI_UPLOAD_FALLBACK = `
        location @persistent_wiki_upload {
            if ($request_method !~ "^(GET|HEAD)$") { return 405; }
            # Only generated image names can reach the persistent public upload store.
            if ($uri !~ "^/assets/wiki/(?:[a-z0-9-]{1,32}/)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.(?:png|jpg|webp|gif)$") { return 404; }
            proxy_pass http://upstream_bot;
            proxy_http_version 1.1;
            proxy_pass_request_headers off;
            proxy_set_header Host $host;
            proxy_set_header Accept $http_accept;
            proxy_set_header Range $http_range;
            proxy_set_header If-None-Match $http_if_none_match;
            proxy_set_header If-Modified-Since $http_if_modified_since;
            proxy_hide_header Set-Cookie;
            proxy_connect_timeout 5s;
            proxy_read_timeout 60s;
        }
`;

/** Patch only the mutable production gateway source; activation owns the sealed copy. */
export function patchWikiUploadGateway(source: string): { config: string; changes: number } {
  if (source.includes("location @persistent_wiki_upload")) {
    if (!source.includes("error_page 404 = @persistent_wiki_upload;")) {
      throw new Error("Incomplete persistent upload fallback");
    }
    let changes = 0;
    const config = source.replaceAll(
      "location @persistent_wiki_upload {\n            # Only",
      () => {
        changes++;
        return 'location @persistent_wiki_upload {\n            if ($request_method !~ "^(GET|HEAD)$") { return 405; }\n            # Only';
      },
    );
    return { config, changes };
  }
  let changes = 0;
  let config = "";
  let cursor = 0;
  const locations = /location\s+@cdn_worker\s*\{/g;
  for (let match = locations.exec(source); match; match = locations.exec(source)) {
    const open = locations.lastIndex - 1;
    let depth = 1;
    let quote = "";
    let escaped = false;
    let comment = false;
    let end = open + 1;
    for (; end < source.length && depth > 0; end++) {
      const char = source[end]!;
      if (comment) {
        if (char === "\n") comment = false;
        continue;
      }
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (quote) {
        if (char === quote) quote = "";
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === "#") {
        comment = true;
        continue;
      }
      if (char === "{") depth++;
      if (char === "}") depth--;
    }
    if (depth !== 0) throw new Error("Unclosed production location");
    const body = source.slice(open + 1, end - 1);
    if (!body.includes("proxy_pass http://127.0.0.1:9077;")) {
      throw new Error("Unexpected production CDN owner");
    }
    const next = body.replace(/\s*proxy_intercept_errors\s+(?:on|off);/g, "");
    changes++;
    config +=
      source.slice(cursor, match.index) +
      `location @cdn_worker {${next}\n  proxy_intercept_errors on;\n  error_page 404 = @persistent_wiki_upload;\n}\n${WIKI_UPLOAD_FALLBACK}`;
    cursor = end;
    locations.lastIndex = end;
  }
  config += source.slice(cursor);
  if (changes < 1 || changes > 4) throw new Error("Expected one to four production CDN locations");
  return { config, changes };
}
