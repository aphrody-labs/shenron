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
import { chmodSync, readFileSync, writeFileSync } from "node:fs";

const cookiesFile = process.env.CRUNCHYROLL_COOKIES_FILE;
const tokenFile = process.env.CRUNCHYROLL_TOKEN_FILE;
if (!cookiesFile || !tokenFile)
  throw new Error("CRUNCHYROLL_COOKIES_FILE and CRUNCHYROLL_TOKEN_FILE are required");
const page = process.argv.includes("--page")
  ? process.argv[process.argv.indexOf("--page") + 1]!
  : "https://www.crunchyroll.com/fr/watchlist";
const cookies = JSON.parse(readFileSync(cookiesFile, "utf8")) as Record<string, unknown>[];

let bearer: string | undefined;
const bearerObserved = Promise.withResolvers<void>();
let account: string | undefined;
await using view = new (Bun as any).WebView({
  width: 1280,
  height: 900,
  backend: { type: "chrome", url: false, argv: ["--no-sandbox"] },
});
await view.navigate("https://www.crunchyroll.com/robots.txt");
await view.cdp("Network.enable");
await view.cdp("Network.setCookies", {
  cookies: cookies.map((c) => Object.assign({ url: "https://www.crunchyroll.com/" }, c)),
});
view.addEventListener("Network.requestWillBeSentExtraInfo", (event: any) => {
  const headers = event.data.headers as Record<string, string>;
  const auth = headers.authorization ?? headers.Authorization;
  if (auth?.startsWith("Bearer ") && !bearer) {
    bearer = auth.slice(7);
    if (bearer) bearerObserved.resolve();
  }
});
view.addEventListener("Network.requestWillBeSent", (event: any) => {
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
const challenge = /just a moment|attention required/i.test(title);
if (!bearer) {
  console.log(
    JSON.stringify({
      ok: false,
      title,
      challenge,
      note: challenge
        ? "Cloudflare challenge page; not bypassed"
        : "no bearer observed (not signed in?)",
    }),
  );
  process.exit(1);
}
const payload = JSON.parse(
  Buffer.from(bearer.split(".")[1] ?? "", "base64url").toString() || "{}",
) as { exp?: number; sub?: string };
writeFileSync(
  tokenFile,
  JSON.stringify({
    accessToken: bearer,
    expiresAt: payload.exp ? payload.exp * 1000 : Date.now() + 240_000,
    accountId: account ?? payload.sub ?? null,
    capturedAt: Date.now(),
  }),
  { mode: 0o600 },
);
chmodSync(tokenFile, 0o600);
console.log(
  JSON.stringify({
    ok: true,
    title,
    expiresInSec: payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : null,
    accountKnown: Boolean(account ?? payload.sub),
  }),
);
