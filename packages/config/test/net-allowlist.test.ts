// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { ipInRanges, parseIp, parseIpAllowlist, parseIpRange } from "../src/net";

describe("listes blanches d'adresses", () => {
  test("adresses v4, v6 compressées, v4 mappée et crochets", () => {
    expect(parseIp("81.64.138.142")).toEqual({ family: 4, base: 0x51408a8en, prefix: 32 });
    expect(parseIp("::ffff:81.64.138.142")).toEqual(parseIp("81.64.138.142"));
    expect(parseIp("[2001:41d0:404:200::4d8e]")?.family).toBe(6);
    expect(parseIp("::1")).toEqual({ family: 6, base: 1n, prefix: 128 });
    for (const bad of ["256.1.1.1", "1.2.3", "1::2::3", "gggg::1", "", "1.2.3.4.5"])
      expect(parseIp(bad)).toBeNull();
  });

  test("CIDR normalisés ; préfixes hors bornes refusés", () => {
    expect(parseIpRange("10.8.0.77/24")).toEqual({ family: 4, base: 0x0a080000n, prefix: 24 });
    expect(parseIpRange("2001:db8::1/32")?.prefix).toBe(32);
    expect(parseIpRange("10.0.0.0/33")).toBeNull();
    expect(parseIpRange("10.0.0.0/8/1")).toBeNull();
  });

  test("appartenance : hôte exact, sous-réseau, familles séparées", () => {
    const { ranges, invalid } = parseIpAllowlist(
      "81.64.138.142, 10.8.0.0/24 2001:41d0:404:200::4d8e nimporte",
    );
    expect(invalid).toEqual(["nimporte"]);
    expect(ipInRanges("81.64.138.142", ranges)).toBe(true);
    expect(ipInRanges("::ffff:81.64.138.142", ranges)).toBe(true);
    expect(ipInRanges("81.64.138.143", ranges)).toBe(false);
    expect(ipInRanges("10.8.0.2", ranges)).toBe(true);
    expect(ipInRanges("10.8.1.2", ranges)).toBe(false);
    expect(ipInRanges("2001:41d0:404:200:0:0:0:4d8e", ranges)).toBe(true);
    expect(ipInRanges("2001:41d0:404:200::4d8f", ranges)).toBe(false);
    expect(ipInRanges("unknown", ranges)).toBe(false);
    expect(ipInRanges("81.64.138.142", parseIpAllowlist(undefined).ranges)).toBe(false);
  });
});
