#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * crunchyroll-session: opens the owner's Crunchyroll session in a real Chrome (Bun.WebView), with the owner's
 * cookies, and records the short-lived bearer token the Crunchyroll web app itself uses for its API calls.
 *
 *   bun scripts/ops/crunchyroll-session.ts [--page https://www.crunchyroll.com/fr/watchlist] [--print-status]
 *
 * Inputs (protected env): CRUNCHYROLL_COOKIES_FILE (JSON list of cookies) and CRUNCHYROLL_TOKEN_FILE (output, 0600).
 * The token expires in minutes; crunchyroll-sync.ts reads the file and calls this script again when it is stale.
 * Nothing is printed except non-secret status; a Cloudflare challenge page is reported, never bypassed.
 */
import { dirname, join, resolve } from "node:path";
import { configureImportedRuntime } from "../../packages/crunchyroll/src/import-runtime";
import {
  normalizeCrunchyrollCookies,
  protectPrivateDirectory,
  writeProtectedJson,
} from "./crunchyroll-cookies";

if (process.env.CRUNCHYROLL_IMPORT_HOME)
  await configureImportedRuntime(process.env.CRUNCHYROLL_IMPORT_HOME);
const cookiesFile = process.env.CRUNCHYROLL_COOKIES_FILE;
const tokenFile = process.env.CRUNCHYROLL_IMPORT_HOME
  ? resolve(process.env.CRUNCHYROLL_IMPORT_HOME, "live-session.json")
  : process.env.CRUNCHYROLL_TOKEN_FILE;
if (!cookiesFile || !tokenFile)
  throw new Error("CRUNCHYROLL_COOKIES_FILE and CRUNCHYROLL_TOKEN_FILE are required");
const page = process.argv.includes("--page")
  ? process.argv[process.argv.indexOf("--page") + 1]!
  : "https://www.crunchyroll.com/fr/watchlist";
const destination = new URL(page);
if (
  destination.origin !== "https://www.crunchyroll.com" ||
  destination.username ||
  destination.password
)
  throw new Error("Session navigation requires an official Crunchyroll page");
const cookies = normalizeCrunchyrollCookies(await Bun.file(cookiesFile).json());
const profile = resolve(
  process.env.CRUNCHYROLL_BROWSER_PROFILE ?? join(dirname(cookiesFile), "browser-profile"),
);
await protectPrivateDirectory(profile);

let bearer: string | undefined;
const bearerObserved = Promise.withResolvers<void>();
let account: string | undefined;
await using view = new (Bun as any).WebView({
  width: 1280,
  height: 900,
  backend: { type: "chrome", url: false },
  dataStore: { directory: profile },
});
await view.navigate("https://www.crunchyroll.com/robots.txt");
await view.cdp("Network.enable");
const seedFile = join(profile, "cookie-seed.json");
const seedSha = new Bun.CryptoHasher("sha256").update(JSON.stringify(cookies)).digest("hex");
let previousSeed: string | undefined;
try {
  previousSeed = (await Bun.file(seedFile).json()).sourceSha256;
} catch {
  /* First profile use. */
}
if (previousSeed !== seedSha) {
  await view.cdp("Network.setCookies", { cookies });
  await writeProtectedJson(seedFile, { sourceSha256: seedSha }, true);
}
const trustedRequests = new Set<string>();
view.addEventListener("Network.requestWillBeSentExtraInfo", (event: any) => {
  if (!trustedRequests.has(event.data.requestId)) return;
  const headers = event.data.headers as Record<string, string>;
  const auth = headers.authorization ?? headers.Authorization;
  if (auth?.startsWith("Bearer ") && !bearer) {
    bearer = auth.slice(7);
    if (bearer) bearerObserved.resolve();
  }
});
view.addEventListener("Network.requestWillBeSent", (event: any) => {
  let url: URL;
  try {
    url = new URL(event.data.request?.url);
  } catch {
    return;
  }
  if (
    url.protocol !== "https:" ||
    !["www.crunchyroll.com", "beta-api.crunchyroll.com"].includes(url.hostname) ||
    url.port
  )
    return;
  trustedRequests.add(event.data.requestId);
  const headers = (event.data.request?.headers ?? {}) as Record<string, string>;
  const auth = headers.authorization ?? headers.Authorization;
  if (auth?.startsWith("Bearer ") && !bearer) {
    bearer = auth.slice(7);
    if (bearer) bearerObserved.resolve();
  }
  const match = /\/accounts\/v1\/me|\/content\/v2\/([0-9a-f-]{36})\//.exec(
    event.data.request?.url ?? "",
  );
  if (match?.[1]) account = match[1];
});
await view.navigate(page);
if (!bearer) {
  const deadline = setTimeout(() => bearerObserved.resolve(), 20_000);
  try {
    await bearerObserved.promise;
  } finally {
    clearTimeout(deadline);
  }
}
const title = String(await view.evaluate("document.title"));
const challenge = /just a moment|attention required|un instant/i.test(title);
if (!bearer) {
  console.log(
    JSON.stringify({
      ok: false,
      title,
      challenge,
      persistentProfile: true,
      note: challenge
        ? "Cloudflare challenge page; not bypassed"
        : "no bearer observed (not signed in?)",
    }),
  );
  process.exitCode = 1;
} else {
  let payload: { exp?: number; sub?: string } = {};
  try {
    const decoded = JSON.parse(
      Buffer.from(bearer.split(".")[1] ?? "", "base64url").toString() || "{}",
    );
    if (typeof decoded.exp === "number" && Number.isFinite(decoded.exp)) payload.exp = decoded.exp;
    if (typeof decoded.sub === "string") payload.sub = decoded.sub;
  } catch {
    /* Opaque provider tokens have no locally readable claims. */
  }
  await writeProtectedJson(
    tokenFile,
    {
      accessToken: bearer,
      expiresAt: payload.exp ? payload.exp * 1000 : Date.now() + 240_000,
      accountId: account ?? payload.sub ?? null,
      capturedAt: Date.now(),
    },
    true,
  );
  console.log(
    JSON.stringify({
      ok: true,
      title,
      expiresInSec: payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : null,
      accountKnown: Boolean(account ?? payload.sub),
      persistentProfile: true,
    }),
  );
}
