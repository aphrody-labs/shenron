// SPDX-License-Identifier: Apache-2.0
/** Administration par adresse IP (`SHENRON_ADMIN_IPS`, `@/lib/admin-ip`). */
import { describe, expect, mock, test } from "bun:test";
import { parseIpAllowlist } from "@shenron/config/net";

mock.module("server-only", () => ({}));
const { adminIpRanges, isAdminIp } = await import("../src/lib/admin-ip");

const ranges = parseIpAllowlist("81.64.138.142, 51.77.147.152, 10.8.0.0/24").ranges;
const from = (headers: Record<string, string>) => new Headers(headers);

describe("administration par adresse IP", () => {
  test("X-Real-IP posé par nginx fait foi", () => {
    expect(isAdminIp(from({ "x-real-ip": "81.64.138.142" }), ranges)).toBe(true);
    expect(isAdminIp(from({ "x-real-ip": "10.8.0.2" }), ranges)).toBe(true);
    expect(isAdminIp(from({ "x-real-ip": "203.0.113.9" }), ranges)).toBe(false);
  });

  test("sans X-Real-IP, seule la dernière entrée de X-Forwarded-For (le proxy) compte", () => {
    expect(isAdminIp(from({ "x-forwarded-for": "81.64.138.142, 203.0.113.9" }), ranges)).toBe(
      false,
    );
    expect(isAdminIp(from({ "x-forwarded-for": "203.0.113.9, 81.64.138.142" }), ranges)).toBe(true);
  });

  test("liste vide, absente ou invalide : personne", () => {
    expect(isAdminIp(from({ "x-real-ip": "81.64.138.142" }), [])).toBe(false);
    expect(adminIpRanges("")).toEqual([]);
    expect(adminIpRanges("pas-une-ip")).toEqual([]);
    expect(isAdminIp(from({}), ranges)).toBe(false);
  });

  test("chaque garde consulte la liste : proxy, session, jetons d'API", async () => {
    const read = (p: string) => Bun.file(new URL(p, import.meta.url)).text();
    expect(await read("../src/proxy.ts")).toContain("isAdminIp(request.headers)");
    expect(await read("../src/lib/session.ts")).toContain("ADMIN_IP_ACTOR");
    expect(await read("../src/lib/api-token.ts")).toContain("isAdminIp(req.headers)");
  });
});
