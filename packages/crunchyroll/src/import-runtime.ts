// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, resolve } from "node:path";
import { convertHar } from "./har-import";
import { parseCrunchyrollHtml } from "./html-import";
import { parseEpisodeSourceFiles } from "./source-directory";

export async function importedCatalogue() {
  const path = process.env.CRUNCHYROLL_BACKEND_ARCHIVE;
  if (!path) return null;
  try {
    const backend = await Bun.file(path).json();
    if (!backend.html) return null;
    if (
      typeof backend.html.text !== "string" ||
      typeof backend.html.sha256 !== "string" ||
      new Bun.CryptoHasher("sha256").update(backend.html.text).digest("hex") !== backend.html.sha256
    )
      throw new Error();
    return await parseCrunchyrollHtml(backend.html.text);
  } catch {
    throw new Error("Cannot read validated Crunchyroll catalogue");
  }
}

async function freshSession(path: string): Promise<boolean> {
  try {
    const session = await Bun.file(path).json();
    return (
      typeof session?.accessToken === "string" &&
      /^[A-Za-z0-9._~+/-]+=*$/.test(session.accessToken) &&
      typeof session.expiresAt === "number" &&
      Number.isFinite(session.expiresAt) &&
      session.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}

/** Loads only credential-file paths. Values stay inside the protected backend files. */
export async function configureImportedRuntime(home: string) {
  const pointer = await Bun.file(join(home, "import.json")).json();
  if (!pointer || pointer.schemaVersion !== 1 || typeof pointer.root !== "string")
    throw new Error("Invalid Crunchyroll import pointer");
  const root = resolve(pointer.root);
  const subpath = relative(resolve(home, "imports"), root);
  if (
    !subpath ||
    subpath === ".." ||
    subpath.startsWith("../") ||
    subpath.startsWith("..\\") ||
    isAbsolute(subpath)
  )
    throw new Error("Invalid Crunchyroll import location");
  const configuration = {
    CRUNCHYROLL_COOKIES_FILE: join(root, "cookies.json"),
    CRUNCHYROLL_IMPORT_FILE: join(root, "ai.json"),
    CRUNCHYROLL_BACKEND_ARCHIVE: join(root, "backend.json"),
    CRUNCHYROLL_BROWSER_PROFILE: resolve(home, "browser-profile"),
    CRUNCHYROLL_TOKEN_FILE: (await freshSession(join(home, "live-session.json")))
      ? resolve(home, "live-session.json")
      : (await Bun.file(join(root, "session.json")).exists())
        ? join(root, "session.json")
        : undefined,
  };
  for (const [key, value] of Object.entries(configuration)) {
    if (value) process.env[key] = value;
    else delete process.env[key];
  }
}

/** Rebuilds the AI view from validated input; never forwards arbitrary imported text or credentials. */
export async function importedArchiveStatus() {
  const path = process.env.CRUNCHYROLL_BACKEND_ARCHIVE;
  if (!path) return { configured: false };
  try {
    const backend = await Bun.file(path).json();
    if (backend?.schemaVersion !== 1 || !Array.isArray(backend.cookies)) throw new Error();
    return {
      configured: true,
      ...convertHar(backend.archive, backend.sourceSha256, backend.cookies.length).ai,
      catalogue: await importedCatalogue(),
      sourceFiles: backend.directory ? parseEpisodeSourceFiles(backend.directory.files) : [],
    };
  } catch {
    throw new Error("Cannot read validated Crunchyroll import");
  }
}
