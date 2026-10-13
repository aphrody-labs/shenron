// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageVideoPublic } from "./video-assets";

test("payload and CDN carry only the same owner's exact worker and upstream license", () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-video-assets-"));
  try {
    const owner = join(root, "owner");
    mkdirSync(owner);
    const license = "Copyright (c) 2017 Dailymotion\nApache License, Version 2.0\n";
    const assets = {
      version: "1.7.3",
      license: join(owner, "LICENSE"),
      worker: join(owner, "hls.worker.js"),
    };
    writeFileSync(assets.license, license);
    writeFileSync(assets.worker, "self.onmessage = () => {};\n");
    writeFileSync(join(owner, ".env"), "private sentinel");
    const payload = stageVideoPublic(assets, join(root, "payload"));
    expect(stageVideoPublic(assets, join(root, "cdn"))).toEqual(payload);
    for (const target of ["payload", "cdn"]) {
      const output = join(root, target, "assets/bun-video");
      expect(readdirSync(output).toSorted()).toEqual(["LICENSE.txt", "hls.worker.js"]);
      expect(readFileSync(join(output, "LICENSE.txt"), "utf8")).toBe(license);
      expect(readFileSync(join(output, "hls.worker.js"))).toEqual(readFileSync(assets.worker));
    }
    writeFileSync(assets.worker, "");
    expect(() => stageVideoPublic(assets, join(root, "rejected"))).toThrow();
    expect(existsSync(join(root, "rejected"))).toBe(false);
    writeFileSync(assets.worker, "worker");
    writeFileSync(assets.license, "BSD-2-Clause");
    expect(() => stageVideoPublic(assets, join(root, "wrong-license"))).toThrow("license");
    expect(existsSync(join(root, "wrong-license"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
