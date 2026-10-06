/**
 * Recovery from a chunk that no longer exists (ChunkLoadError).
 *
 * A tab opened before a release keeps the previous build's chunk list; a client navigation
 * then asks for files the new release does not serve. The CDN keeps every former chunk, but a
 * missing one can still slip through (CDN published late, cache purge). The only sound answer
 * is a full reload onto the current build — once: a session flag stops a reload loop when the
 * chunk is missing for another reason.
 */
export const CHUNK_RELOAD_KEY = "shenron:chunk-reload";
/** A second reload is allowed only after this delay (a new release, not the same failure). */
const RETRY_AFTER_MS = 60_000;

/** Is this error (or rejection reason) a failed chunk load? */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  return (
    typeof message === "string" &&
    /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|Failed to fetch dynamically imported module/i.test(
      message,
    )
  );
}

interface ReloadDeps {
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  reload: () => void;
  now: () => number;
}

/**
 * Reloads once for a chunk error; returns whether a reload was triggered. Storage errors
 * (private mode) mean no guard: then nothing is reloaded, rather than risking a loop.
 */
export function recoverFromChunkError(error: unknown, deps: ReloadDeps): boolean {
  if (!isChunkLoadError(error) || !deps.storage) return false;
  try {
    const last = Number(deps.storage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Number.isFinite(last) && deps.now() - last < RETRY_AFTER_MS) return false;
    deps.storage.setItem(CHUNK_RELOAD_KEY, String(deps.now()));
  } catch {
    return false;
  }
  deps.reload();
  return true;
}

/** The browser wiring of `recoverFromChunkError`. */
export function browserReloadDeps(): ReloadDeps {
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return { storage, reload: () => window.location.reload(), now: () => Date.now() };
}
