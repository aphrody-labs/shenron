// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageHlsPublic } from "./hls-license";
import { requireVendorFile } from "./prepare-vendor";

test("payload and CDN carry exact worker and upstream notices without private vendor files", () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-hls-public-"));
  const vendor = join(root, "vendor");
  try {
    mkdirSync(join(vendor, "dist"), { recursive: true });
    const license = "Copyright (c) 2017 Dailymotion\nApache License, Version 2.0\n";
    writeFileSync(join(vendor, "LICENSE"), license);
    writeFileSync(join(vendor, "NOTICE"), "Exact additional notice\n");
    writeFileSync(join(vendor, "dist/hls.worker.js"), "self.onmessage = () => {};\n");
    writeFileSync(join(vendor, ".env"), "private sentinel");
    const first = stageHlsPublic(vendor, join(root, "payload/public"));
    expect(stageHlsPublic(vendor, join(root, "cdn/site"))).toEqual(first);
    for (const destination of ["payload/public", "cdn/site"]) {
      const output = join(root, destination, "assets/vendor/hls");
      expect(readdirSync(output).toSorted()).toEqual([
        "LICENSE.txt",
        "NOTICE.txt",
        "hls.worker.js",
      ]);
      expect(readFileSync(join(output, "LICENSE.txt"), "utf8")).toBe(license);
      expect(readFileSync(join(output, "NOTICE.txt"))).toEqual(
        readFileSync(join(vendor, "NOTICE")),
      );
      expect(readFileSync(join(output, "hls.worker.js"))).toEqual(
        readFileSync(join(vendor, "dist/hls.worker.js")),
      );
    }
    rmSync(join(vendor, "NOTICE"));
    expect(stageHlsPublic(vendor, join(root, "without-notice")).map((item) => item.name)).toEqual([
      "LICENSE.txt",
      "hls.worker.js",
    ]);
    writeFileSync(join(vendor, "dist/hls.worker.js"), "");
    expect(() => stageHlsPublic(vendor, join(root, "rejected"))).toThrow();
    expect(existsSync(join(root, "rejected"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("wrong license fails before exposing any vendor files", () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-hls-license-"));
  try {
    writeFileSync(join(root, "LICENSE"), "BSD-2-Clause");
    expect(() => stageHlsPublic(root, join(root, "public"))).toThrow("license");
    expect(existsSync(join(root, "public"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("vendor exports cannot escape or follow a symlink into private content", () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-hls-path-"));
  try {
    const vendor = join(root, "vendor");
    mkdirSync(vendor);
    writeFileSync(join(root, "private.txt"), "private sentinel");
    expect(() => requireVendorFile(vendor, "../private.txt")).toThrow("escapes");
    symlinkSync(join(root, "private.txt"), join(vendor, "linked.txt"), "file");
    expect(() => requireVendorFile(vendor, "linked.txt")).toThrow("symlink");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
