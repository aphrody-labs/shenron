// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { rmSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  importCrunchyrollCookies,
  normalizeCrunchyrollCookies,
  protectPrivateDirectory,
  writeProtectedJson,
} from "./crunchyroll-cookies";

const cookie = {
  domain: "www.crunchyroll.com",
  name: "session",
  value: "fake-owner-secret",
  path: "/",
  secure: true,
  httpOnly: true,
  hostOnly: true,
  expirationDate: 2000,
  sameSite: "no_restriction",
};
const directories: string[] = [];
const privateDirectory = () => {
  const path = join(
    import.meta.dir,
    "../../var/reports/crunchyroll-cookie-tests",
    crypto.randomUUID(),
  );
  directories.push(path);
  return path;
};
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("Crunchyroll browser cookie normalization", () => {
  test("preserves host-only scope, expiry, security and normalized SameSite", () => {
    const cookies = normalizeCrunchyrollCookies([cookie], 1000);
    expect(cookies).toEqual([
      {
        name: "session",
        value: "fake-owner-secret",
        url: "https://www.crunchyroll.com/",
        path: "/",
        secure: true,
        httpOnly: true,
        expires: 2000,
        sameSite: "None",
      },
    ]);
    expect(normalizeCrunchyrollCookies(cookies, 1000)).toEqual(cookies);
  });
  test("preserves subdomain cookies and drops browser extension attributes", () => {
    const [result] = normalizeCrunchyrollCookies(
      [{ ...cookie, domain: ".crunchyroll.com", hostOnly: false, sameSite: "lax", storeId: "0" }],
      1000,
    );
    expect(result?.domain).toBe(".crunchyroll.com");
    expect(result?.url).toBeUndefined();
    expect(result?.sameSite).toBe("Lax");
    expect(result).not.toHaveProperty("storeId");
  });
  test("session cookies have no expiry and expired persistent cookies are removed", () => {
    expect(normalizeCrunchyrollCookies([cookie], 3000)).toEqual([]);
    expect(normalizeCrunchyrollCookies([{ ...cookie, session: true }], 3000)[0]).not.toHaveProperty(
      "expires",
    );
    expect(
      normalizeCrunchyrollCookies([{ ...cookie, expirationDate: -1 }], 3000)[0],
    ).not.toHaveProperty("expires");
  });
  test("rejects foreign hosts, domain suffix tricks, unsafe URLs and control characters without exposing values", () => {
    for (const entry of [
      { ...cookie, domain: "crunchyroll.com.evil.test" },
      { ...cookie, domain: "evilcrunchyroll.com" },
      { ...cookie, domain: undefined, url: "https://www.crunchyroll.com/?token=fake-owner-secret" },
      { ...cookie, domain: undefined, url: "https://fake-owner-secret@www.crunchyroll.com/" },
      { ...cookie, value: "fake-owner-secret\r\nInjected: true" },
      { ...cookie, name: "session;bad" },
      { ...cookie, secure: false },
      { ...cookie, expirationDate: Number.NaN },
    ]) {
      expect(() => normalizeCrunchyrollCookies([entry], 1000)).toThrow(
        "Invalid Crunchyroll cookie export",
      );
    }
    for (const root of [null, {}, "fake-owner-secret", [null]])
      expect(() => normalizeCrunchyrollCookies(root)).toThrow("Invalid Crunchyroll cookie export");
  });
});

describe("private cookie storage", () => {
  test("protects a browser directory and passes private permissions to children", async () => {
    const directory = join(privateDirectory(), "browser's profile");
    const protectedPath = protectPrivateDirectory(directory);
    expect(statSync(protectedPath).isDirectory()).toBe(true);
    const child = join(protectedPath, "browser-state.json");
    await Bun.write(child, "{}");
    if (process.platform === "win32") {
      const acl = Bun.spawnSync(["icacls", protectedPath], { stdout: "pipe", stderr: "pipe" });
      const descriptor = new TextDecoder().decode(acl.stdout);
      expect(acl.exitCode).toBe(0);
      expect(descriptor).toContain("(OI)(CI)(F)");
      expect(descriptor).not.toContain("(I)");
      const childAcl = Bun.spawnSync(["icacls", child], { stdout: "pipe", stderr: "pipe" });
      expect(childAcl.exitCode).toBe(0);
      expect(new TextDecoder().decode(childAcl.stdout)).toContain("(I)(F)");
    } else expect(statSync(protectedPath).mode & 0o777).toBe(0o700);
    expect(() => protectPrivateDirectory(import.meta.dir)).toThrow("ignored by Git");
  });
  test("writes private JSON, refuses implicit replacement and supports explicit replacement", async () => {
    const output = join(privateDirectory(), "cookies.json");
    await writeProtectedJson(output, { test: "private" });
    expect(await Bun.file(output).json()).toEqual({ test: "private" });
    if (process.platform !== "win32") expect(statSync(output).mode & 0o777).toBe(0o600);
    else {
      const acl = Bun.spawnSync(["icacls", output], { stdout: "pipe", stderr: "pipe" });
      expect(acl.exitCode).toBe(0);
      expect(new TextDecoder().decode(acl.stdout)).not.toContain("(I)");
    }
    await expect(writeProtectedJson(output, { test: "replace" })).rejects.toThrow("exists");
    await writeProtectedJson(output, { test: "replace" }, true);
    expect(await Bun.file(output).json()).toEqual({ test: "replace" });
  });
  test("rejects a destination that Git would track", async () => {
    await expect(
      writeProtectedJson(join(import.meta.dir, "cookie-secret-must-not-exist.json"), {}),
    ).rejects.toThrow("ignored by Git");
    expect(
      await Bun.file(join(import.meta.dir, "cookie-secret-must-not-exist.json")).exists(),
    ).toBe(false);
  });
  test("CLI prints counts only and import errors contain no secret", async () => {
    const dir = privateDirectory();
    const input = join(dir, "input.json");
    const output = join(dir, "cookies.json");
    await Bun.write(input, JSON.stringify([{ ...cookie, session: true }]));
    const processResult = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, "crunchyroll-cookies.ts"),
        "--input",
        input,
        "--output",
        output,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(processResult.stdout).text(),
      new Response(processResult.stderr).text(),
      processResult.exited,
    ]);
    expect(exit).toBe(0);
    expect(JSON.parse(stdout)).toEqual({ ok: true, cookies: 1 });
    expect(stdout + stderr).not.toContain(cookie.value);
    await Bun.write(input, "{fake-owner-secret invalid-json");
    await expect(importCrunchyrollCookies(input, output, true)).rejects.toThrow(
      "Cannot read cookie export as JSON",
    );
  });
});
