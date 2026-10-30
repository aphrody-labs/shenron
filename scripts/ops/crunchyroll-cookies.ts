#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import {
  chmodSync,
  closeSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export interface CrunchyrollCookie {
  name: string;
  value: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  domain?: string;
  url?: string;
  sameSite?: "Strict" | "Lax" | "None";
  expires?: number;
}

const domains = new Set([
  "crunchyroll.com",
  ".crunchyroll.com",
  "www.crunchyroll.com",
  ".www.crunchyroll.com",
]);
const invalid = () => new Error("Invalid Crunchyroll cookie export");
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Converts browser exports or an already normalized jar to CDP CookieParam values. */
export function normalizeCrunchyrollCookies(
  input: unknown,
  nowSec = Date.now() / 1000,
): CrunchyrollCookie[] {
  if (!Array.isArray(input) || !Number.isFinite(nowSec)) throw invalid();
  const cookies: CrunchyrollCookie[] = [];
  for (const entry of input) {
    if (!object(entry)) throw invalid();
    let domain = entry.domain;
    if (entry.url !== undefined) {
      if (typeof entry.url !== "string") throw invalid();
      let url: URL;
      try {
        url = new URL(entry.url);
      } catch {
        throw invalid();
      }
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash
      )
        throw invalid();
      if (!domains.has(url.hostname)) throw invalid();
      domain ??= url.hostname;
    }
    if (typeof domain !== "string" || !domains.has(domain)) throw invalid();
    if (typeof entry.name !== "string" || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(entry.name))
      throw invalid();
    if (
      typeof entry.value !== "string" ||
      Array.from(entry.value).some(
        (char) =>
          char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === ";" || char === ",",
      )
    )
      throw invalid();
    const path = entry.path ?? "/";
    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      Array.from(path).some(
        (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === ";",
      )
    )
      throw invalid();
    for (const key of ["secure", "httpOnly", "hostOnly", "session"] as const) {
      if (entry[key] !== undefined && typeof entry[key] !== "boolean") throw invalid();
    }
    const expiry = entry.expirationDate ?? entry.expires;
    if (expiry !== undefined && (typeof expiry !== "number" || !Number.isFinite(expiry)))
      throw invalid();
    const session = entry.session === true || expiry === undefined || expiry === -1;
    if (!session && (expiry as number) <= nowSec) continue;
    const cookie: CrunchyrollCookie = {
      name: entry.name,
      value: entry.value,
      path,
      secure: entry.secure !== false,
      httpOnly: entry.httpOnly === true,
    };
    // CDP's URL form preserves host-only scope; a leading-dot domain preserves subdomain scope.
    if (entry.hostOnly === true || (!domain.startsWith(".") && entry.hostOnly !== false))
      cookie.url = `https://${domain.replace(/^\./, "")}${path}`;
    else cookie.domain = domain.startsWith(".") ? domain : `.${domain}`;
    if (!session) cookie.expires = expiry as number;
    const site = entry.sameSite;
    if (site !== undefined && site !== null && site !== "unspecified") {
      if (typeof site !== "string") throw invalid();
      const sites: Record<string, CrunchyrollCookie["sameSite"]> = {
        strict: "Strict",
        lax: "Lax",
        none: "None",
        no_restriction: "None",
      };
      const normalized = Object.hasOwn(sites, site.toLowerCase())
        ? sites[site.toLowerCase()]
        : undefined;
      if (!normalized) throw invalid();
      cookie.sameSite = normalized;
      if (normalized === "None" && !cookie.secure) throw invalid();
    }
    cookies.push(cookie);
  }
  return cookies;
}

function beneath(root: string, target: string): boolean {
  const path = relative(root, target);
  return (
    path !== "" &&
    path !== ".." &&
    !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(path)
  );
}

function assertPrivateDestination(destination: string): void {
  const repository = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (repository.exitCode !== 0) throw new Error("Repository privacy check unavailable");
  const root = realpathSync(new TextDecoder().decode(repository.stdout).trim());
  if (beneath(root, destination)) {
    const ignored = Bun.spawnSync(["git", "check-ignore", "--quiet", "--", destination], {
      cwd: root,
      stdout: "ignore",
      stderr: "ignore",
    });
    if (ignored.exitCode !== 0) throw new Error("Cookie destination must be ignored by Git");
  } else if (!beneath(realpathSync(homedir()), destination))
    throw new Error("Cookie destination must be inside the private home directory");
}

function windowsOwnerSid(): string {
  // The System32 binary: a POSIX `whoami` earlier on PATH (Git Bash, MSYS) rejects `/user`.
  const whoami = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "whoami.exe");
  const identity = Bun.spawnSync([whoami, "/user", "/fo", "csv", "/nh"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const sid = new TextDecoder().decode(identity.stdout).match(/S-1-5-\d+(?:-\d+)+/)?.[0];
  if (identity.exitCode !== 0 || !sid) throw new Error("Cannot determine private file owner");
  return sid;
}

/** Secures the root of a persistent browser profile before Chrome can write credentials. */
export function protectPrivateDirectory(path: string): string {
  const requested = resolve(path);
  assertPrivateDestination(requested);
  mkdirSync(requested, { recursive: true, mode: 0o700 });
  if (lstatSync(requested).isSymbolicLink())
    throw new Error("Private directory must not be a symbolic link");
  const destination = realpathSync(requested);
  assertPrivateDestination(destination);
  if (process.platform === "win32") {
    const sid = windowsOwnerSid();
    const literal = destination.replace(/'/g, "''");
    // A fresh descriptor also removes pre-existing explicit grants, without a permissive reset.
    const script = `$ErrorActionPreference='Stop'; $acl=[System.Security.AccessControl.DirectorySecurity]::new(); $acl.SetAccessRuleProtection($true,$false); foreach($id in @('${sid}','S-1-5-18')) { $rule=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($id),[System.Security.AccessControl.FileSystemRights]::FullControl,[System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow); $acl.AddAccessRule($rule) }; [System.IO.Directory]::SetAccessControl('${literal}', $acl)`;
    const acl = Bun.spawnSync(
      [
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    if (acl.exitCode !== 0) throw new Error("Cannot protect private directory permissions");
  } else chmodSync(destination, 0o700);
  return destination;
}

/** Writes sensitive JSON atomically, to an ignored repository path or a private home path. */
export async function writeProtectedJson(
  output: string,
  value: unknown,
  overwrite = false,
): Promise<void> {
  const requested = resolve(output);
  assertPrivateDestination(requested);
  mkdirSync(dirname(requested), { recursive: true, mode: 0o700 });
  const destination = join(realpathSync(dirname(requested)), basename(requested));
  assertPrivateDestination(destination);
  let exists = false;
  try {
    const stat = lstatSync(destination);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Cookie destination must be a regular file");
    exists = true;
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
  if (exists && !overwrite)
    throw new Error("Cookie destination exists; use --overwrite to replace it");
  const temporary = join(dirname(destination), `.crunchyroll-${crypto.randomUUID()}.tmp`);
  closeSync(openSync(temporary, "wx", 0o600));
  try {
    if (process.platform === "win32") {
      const sid = windowsOwnerSid();
      const acl = Bun.spawnSync(
        ["icacls", temporary, "/inheritance:r", "/grant:r", `*${sid}:(F)`, "*S-1-5-18:(F)"],
        { stdout: "ignore", stderr: "ignore" },
      );
      if (acl.exitCode !== 0) throw new Error("Cannot protect cookie file permissions");
    } else chmodSync(temporary, 0o600);
    await Bun.write(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    if (overwrite) renameSync(temporary, destination);
    else linkSync(temporary, destination);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // Preserve an import failure; any remaining temporary file has the protected ACL.
    }
  }
}

export async function importCrunchyrollCookies(input: string, output: string, overwrite = false) {
  let parsed: unknown;
  try {
    parsed = await Bun.file(input).json();
  } catch {
    throw new Error("Cannot read cookie export as JSON");
  }
  const cookies = normalizeCrunchyrollCookies(parsed);
  if (!cookies.length) throw new Error("Cookie export contains no unexpired cookies");
  await writeProtectedJson(output, cookies, overwrite);
  return { ok: true, cookies: cookies.length };
}

if (import.meta.main) {
  try {
    const args = Bun.argv.slice(2);
    const input = args[args.indexOf("--input") + 1];
    const output = args[args.indexOf("--output") + 1];
    if (
      !args.includes("--input") ||
      !args.includes("--output") ||
      !input ||
      !output ||
      input.startsWith("--") ||
      output.startsWith("--")
    )
      throw new Error(
        "Usage: crunchyroll-cookies.ts --input <export.json> --output <private.json> [--overwrite]",
      );
    console.log(
      JSON.stringify(await importCrunchyrollCookies(input, output, args.includes("--overwrite"))),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Cookie import failed",
      }),
    );
    process.exitCode = 1;
  }
}
