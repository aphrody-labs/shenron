// SPDX-License-Identifier: Apache-2.0
import { lstat, realpath, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

function assertContained(base: string, path: string): void {
  const offset = relative(base, path);
  if (offset === ".." || offset.startsWith("../") || isAbsolute(offset)) {
    throw new Error("artifact path escapes its declared store");
  }
}

async function assertNoEscape(base: string, path: string): Promise<void> {
  const stat = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (stat) {
    if (stat.isSymbolicLink()) throw new Error("artifact path cannot traverse a symlink");
    assertContained(base, await realpath(path));
    return;
  }
  const parent = dirname(path);
  if (parent === path) throw new Error("artifact store does not exist");
  return assertNoEscape(base, parent);
}

/**
 * External artifact store, opt-in by SHENRON_ARTIFACT_ROOT (or the older APHRODY_ARTIFACT_ROOT):
 * an absolute, canonical directory outside the checkout, namespaced by the full source revision.
 * Without it, outputs stay relative to the checkout.
 */
export async function artifactStore(
  repo: string,
  env: Record<string, string | undefined> = process.env,
  revision?: string,
): Promise<string> {
  const requested = (env.SHENRON_ARTIFACT_ROOT ?? env.APHRODY_ARTIFACT_ROOT)?.trim();
  if (!requested) return resolve(repo);
  if (!isAbsolute(requested)) throw new Error("artifact root must be absolute");
  if (!revision || !/^[a-f0-9]{40}$/.test(revision))
    throw new Error("artifact namespace requires a full source revision");
  const root = resolve(requested);
  const store = resolve(root, `shenron-${revision}`);
  assertContained(root, store);
  // The root is provisioned before execution.
  if ((await realpath(root)) !== root) throw new Error("artifact root is not canonical");
  await assertNoEscape(root, store);
  if (!relative(resolve(repo), store).startsWith("../")) {
    throw new Error("external artifacts must stay outside the source checkout");
  }
  await mkdir(store, { recursive: true });
  return store;
}

export async function artifactPath(store: string, argument: string): Promise<string> {
  if (
    !argument ||
    isAbsolute(argument) ||
    argument.split("/").includes("..") ||
    /[\\\r\n]/.test(argument)
  ) {
    throw new Error("artifact output must be a contained relative path");
  }
  const path = resolve(store, argument);
  assertContained(store, path);
  await assertNoEscape(store, path);
  return path;
}
