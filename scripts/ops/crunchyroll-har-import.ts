#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { resolve, join } from "node:path";
import { convertHar } from "../../packages/crunchyroll/src/har-import";
import { parseCrunchyrollHtml } from "../../packages/crunchyroll/src/html-import";
import { inventoryEpisodeDirectory } from "../../packages/crunchyroll/src/source-directory";
import { normalizeCrunchyrollCookies, writeProtectedJson } from "./crunchyroll-cookies";

export async function importCrunchyrollArchive(
  harPath: string,
  cookiesPath: string,
  home: string,
  htmlPath?: string,
  directoryPath?: string,
) {
  const har = Bun.file(harPath);
  if (har.size > 100 * 1024 * 1024) throw new Error("HAR exceeds the 100 MiB import limit");
  let input: unknown;
  let cookieInput: unknown;
  let bytes: Uint8Array;
  try {
    bytes = await har.bytes();
    input = JSON.parse(new TextDecoder().decode(bytes));
    cookieInput = await Bun.file(cookiesPath).json();
  } catch {
    throw new Error("Cannot read HAR and cookie exports as JSON");
  }
  const cookies = normalizeCrunchyrollCookies(cookieInput);
  const sha = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const imported = convertHar(input, sha, cookies.length);
  const directory = directoryPath ? await inventoryEpisodeDirectory(directoryPath) : undefined;
  let html:
    | { text: string; sha256: string; metadata: Awaited<ReturnType<typeof parseCrunchyrollHtml>> }
    | undefined;
  if (htmlPath) {
    const file = Bun.file(htmlPath);
    if (file.size > 10 * 1024 * 1024) throw new Error("HTML exceeds the 10 MiB import limit");
    const text = await file.text();
    html = {
      text,
      sha256: new Bun.CryptoHasher("sha256").update(text).digest("hex"),
      metadata: await parseCrunchyrollHtml(text),
    };
  }
  const root = resolve(home, "imports", `${sha}-${crypto.randomUUID()}`);
  // Keep originals and the complete parsed archive, including unknown fields, in the protected backend store.
  await writeProtectedJson(join(root, "backend.json"), {
    schemaVersion: 1,
    sourceSha256: sha,
    archive: imported.archive,
    cookies: cookieInput,
    sessions: imported.sessions,
    ...(html ? { html } : {}),
    ...(directory ? { directory } : {}),
  });
  await writeProtectedJson(join(root, "cookies.json"), cookies);
  const ai = {
    ...imported.ai,
    ...(html ? { catalogue: html.metadata } : {}),
    ...(directory ? { sourceFiles: directory.files } : {}),
  };
  await writeProtectedJson(join(root, "ai.json"), ai);
  const latest = imported.sessions.toSorted((a, b) => b.capturedAt - a.capturedAt)[0];
  if (latest) await writeProtectedJson(join(root, "session.json"), latest);
  const configuration = {
    CRUNCHYROLL_COOKIES_FILE: join(root, "cookies.json"),
    ...(latest ? { CRUNCHYROLL_TOKEN_FILE: join(root, "session.json") } : {}),
    CRUNCHYROLL_IMPORT_FILE: join(root, "ai.json"),
  };
  await writeProtectedJson(join(root, "config.json"), configuration);
  // Publication pointer is written last; interrupted imports never activate partial credentials.
  await writeProtectedJson(
    join(resolve(home), "import.json"),
    { schemaVersion: 1, root, configuration, summary: ai },
    true,
  );
  return { ok: true, root, ...ai };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const arg = (key: string) => (args.includes(key) ? args[args.indexOf(key) + 1] : undefined);
  try {
    const har = arg("--har"),
      cookies = arg("--cookies"),
      home = arg("--home");
    if (!har || !cookies || !home || [har, cookies, home].some((v) => v.startsWith("--")))
      throw new Error(
        "Usage: crunchyroll-har-import.ts --har <capture.har> --cookies <export.json> --home <private-directory> [--html <page.html>]",
      );
    console.log(
      JSON.stringify(
        await importCrunchyrollArchive(har, cookies, home, arg("--html"), arg("--directory")),
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Import failed",
      }),
    );
    process.exitCode = 1;
  }
}
