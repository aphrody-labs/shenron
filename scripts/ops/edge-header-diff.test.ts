// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { DEFAULT_IGNORE, diffHeaders, parseHeaders, statusOf } from "./edge-header-diff";

const dump = (lines: string[]) => `${lines.join("\r\n")}\r\n\r\n`;

describe("edge-header-diff", () => {
  test("parses the last response block and keeps repeated headers", () => {
    const headers = parseHeaders(
      dump(["HTTP/1.1 301 Moved", "Location: /a"]) +
        dump(["HTTP/2 200", "Content-Type: text/html", "Vary: rsc", "vary: accept-encoding"]),
    );
    expect(headers.get("content-type")).toEqual(["text/html"]);
    expect(headers.get("vary")).toEqual(["rsc", "accept-encoding"]);
    expect(headers.has("location")).toBe(false);
    expect(statusOf(dump(["HTTP/2 404", "a: b"]))).toBe("404");
  });

  test("ignores Date, Age, Server and CF-* and reports real differences", () => {
    const nginx = parseHeaders(
      dump(["HTTP/2 200", "Date: a", "Server: nginx", "CF-Ray: 1", "X-Shenron-LB-Cache: HIT", "Link: </a>"]),
    );
    const edge = parseHeaders(
      dump(["HTTP/2 200", "Date: b", "Server: shenron-edge", "Age: 3", "X-Shenron-LB-Cache: MISS"]),
    );
    expect(diffHeaders(nginx, edge, DEFAULT_IGNORE)).toEqual([
      { name: "link", nginx: ["</a>"], edge: [] },
      { name: "x-shenron-lb-cache", nginx: ["HIT"], edge: ["MISS"] },
    ]);
  });

  test("value order of repeated headers does not matter", () => {
    const a = parseHeaders(dump(["HTTP/2 200", "Vary: a", "Vary: b"]));
    const b = parseHeaders(dump(["HTTP/2 200", "Vary: b", "Vary: a"]));
    expect(diffHeaders(a, b)).toEqual([]);
  });
});
