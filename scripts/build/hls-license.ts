// SPDX-License-Identifier: Apache-2.0
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { requireVendorFile } from "./prepare-vendor";

/** Stage exact upstream notices and the same-origin worker, never the vendor source tree. */
export function stageHlsPublic(vendor: string, publicRoot: string) {
  const license = readFileSync(requireVendorFile(vendor, "LICENSE"), "utf8");
  if (!license.includes("Apache License, Version 2.0") || !license.includes("2017 Dailymotion"))
    throw new Error("HLS Apache license or Dailymotion notice is missing");
  const sources = ["LICENSE", "dist/hls.worker.js"];
  if (existsSync(join(vendor, "NOTICE"))) sources.push("NOTICE");
  // Validate every source before creating any public file.
  const checked = sources.map((source) => requireVendorFile(vendor, source));
  const output = join(publicRoot, "assets/vendor/hls");
  mkdirSync(output, { recursive: true });
  return sources.map((source, index) => {
    const name = source === "dist/hls.worker.js" ? "hls.worker.js" : `${source}.txt`;
    const destination = join(output, name);
    copyFileSync(checked[index]!, destination);
    return {
      name,
      sha256: new Bun.CryptoHasher("sha256").update(readFileSync(destination)).digest("hex"),
    };
  });
}
