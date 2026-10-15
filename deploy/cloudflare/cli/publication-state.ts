// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { chmod, link, lstat, mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { digest } from "./cloudflare-ops";

export async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (process.platform !== "win32" && (info.mode & 0o077 || info.uid !== process.getuid?.()))
  )
    throw Error("Publication directory is not private");
}

/** A replay can fill missing files, but never replace different staged bytes. */
export async function writeImmutablePrivate(path: string, text: string) {
  const temporary = join(dirname(path), ".publication-" + crypto.randomUUID() + ".tmp");
  try {
    await writeFile(temporary, text, { mode: 0o600, flag: "wx" });
    try {
      await link(temporary, path);
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
    }
  } finally {
    await unlink(temporary).catch((error: { code?: string }) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size !== Buffer.byteLength(text) ||
    (process.platform !== "win32" && (info.mode & 0o077 || info.uid !== process.getuid?.())) ||
    digest(await Bun.file(path).bytes()) !== digest(text)
  )
    throw Error("Immutable publication file differs: " + path);
}

/** SQLite supplies a process-death-safe kernel lock; the directory remains the Infra capability. */
export async function acquirePublicationLock(stateDirectory: string) {
  const databasePath = join(stateDirectory, "publication-lock.sqlite");
  try {
    await writeFile(databasePath, "", { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as { code?: string }).code !== "EEXIST") throw error;
  }
  const info = await lstat(databasePath);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    (process.platform !== "win32" && (info.mode & 0o077 || info.uid !== process.getuid?.()))
  )
    throw Error("Publication kernel lock is not private");
  const db = new Database(databasePath);
  try {
    db.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE");
  } catch {
    db.close();
    throw Error("Publication lock is busy");
  }
  const lock = join(stateDirectory, "publish.lock"),
    ownerPath = join(lock, "owner.json");
  const owner = { pid: process.pid, host: hostname(), token: crypto.randomUUID() };
  try {
    const existing = await lstat(lock).catch((error: { code?: string }) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (existing) {
      if (
        !existing.isDirectory() ||
        existing.isSymbolicLink() ||
        (process.platform !== "win32" &&
          (existing.mode & 0o077 || existing.uid !== process.getuid?.()))
      )
        throw Error("Publication lock directory is unsafe");
      const metadata = await lstat(ownerPath).catch(() => undefined);
      if (
        !metadata?.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.size > 1024 ||
        (process.platform !== "win32" &&
          (metadata.mode & 0o077 || metadata.uid !== process.getuid?.()))
      )
        throw Error("Legacy publication lock needs independent owner evidence");
      const previous = await Bun.file(ownerPath).json();
      if (
        previous.host !== owner.host ||
        !Number.isSafeInteger(previous.pid) ||
        previous.pid < 1 ||
        typeof previous.token !== "string"
      )
        throw Error("Publication lock owner is invalid");
      let alive = true;
      try {
        process.kill(previous.pid, 0);
      } catch (error) {
        if ((error as { code?: string }).code === "ESRCH") alive = false;
        else throw error;
      }
      if (alive) throw Error("Publication lock owner is still alive");
      await unlink(ownerPath);
      await rmdir(lock);
    }
    await mkdir(lock, { mode: 0o700 });
    await writeImmutablePrivate(ownerPath, JSON.stringify(owner));
    await chmod(ownerPath, 0o600);
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }
  return async () => {
    try {
      if (!Bun.deepEquals(await Bun.file(ownerPath).json(), owner))
        throw Error("Publication lock ownership changed");
      await unlink(ownerPath);
      await rmdir(lock);
    } finally {
      db.exec("ROLLBACK");
      db.close();
    }
  };
}
