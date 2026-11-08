// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CrunchyrollAuthOptions } from "./client";

const directory = mkdtempSync(join(tmpdir(), "shenron-crunchyroll-client-"));
const now = 1_800_000_000_000;
let sequence = 0;
afterAll(() => rmSync(directory, { recursive: true, force: true }));

async function fixture(contents: unknown, raw = false): Promise<string> {
  const path = join(directory, `session-${sequence++}.json`);
  await Bun.write(path, raw ? String(contents) : JSON.stringify(contents));
  return path;
}

function inspect(options: CrunchyrollAuthOptions, advanceMs = 0) {
  const env = { ...process.env };
  for (const key of [
    "BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN",
    "CRUNCHYROLL_BEARER_TOKEN",
    "BUN_VIDEO_CRUNCHYROLL_ACCOUNT_ID",
    "CRUNCHYROLL_TOKEN_FILE",
    "CRUNCHYROLL_COOKIES_FILE",
  ])
    delete env[key];
  const source = `
    import { CrunchyrollClient } from ${JSON.stringify(new URL("./client.ts", import.meta.url).href)};
    const { options, now, advanceMs } = JSON.parse(process.argv[1]);
    Date.now = () => now;
    const client = new CrunchyrollClient(options);
    Date.now = () => now + advanceMs;
    console.log(JSON.stringify({
      configured: client.isAuthenticated(), cookies: client.hasCookies(),
      token: client.getBearerToken() ?? null, account: client.getAccountId() ?? null,
    }));
  `;
  const result = Bun.spawnSync(
    [process.execPath, "--no-env-file", "-e", source, JSON.stringify({ options, now, advanceMs })],
    { env, cwd: directory, stdout: "pipe", stderr: "pipe" },
  );
  expect(new TextDecoder().decode(result.stderr)).toBe("");
  expect(result.exitCode).toBe(0);
  return JSON.parse(new TextDecoder().decode(result.stdout)) as {
    configured: boolean;
    cookies: boolean;
    token: string | null;
    account: string | null;
  };
}

describe("Crunchyroll private session credentials", () => {
  test("reads the session writer JSON without sending JSON as a bearer", async () => {
    const tokenFile = await fixture({
      accessToken: "example.token.value",
      expiresAt: now + 30_000,
      accountId: "fixture-account",
      capturedAt: now,
    });
    expect(inspect({ tokenFile })).toEqual({
      configured: true,
      cookies: false,
      token: "example.token.value",
      account: "fixture-account",
    });
    expect(inspect({ tokenFile, accountId: "explicit-account" }).account).toBe("explicit-account");
  });

  test("invalidates a loaded session when its expiry passes", async () => {
    const tokenFile = await fixture({ accessToken: "example-token", expiresAt: now + 100 });
    expect(inspect({ tokenFile }, 100)).toMatchObject({ configured: false, token: null });
  });

  test("rejects stale, malformed and incomplete JSON session files", async () => {
    for (const value of [
      { accessToken: "example-token", expiresAt: now },
      { accessToken: "example-token", expiresAt: "future" },
      { accessToken: "example-token" },
      { accessToken: "token with spaces", expiresAt: now + 1000 },
      { expiresAt: now + 1000 },
      [],
      {},
      null,
      true,
      123,
      "quoted-json-token",
    ]) {
      expect(inspect({ tokenFile: await fixture(value) })).toMatchObject({
        configured: false,
        token: null,
        account: null,
      });
    }
    expect(inspect({ tokenFile: await fixture("{broken", true) }).token).toBeNull();
  });

  test("keeps legacy opaque token files and explicit token precedence", async () => {
    const tokenFile = await fixture("example-token.with_segments\n", true);
    expect(inspect({ tokenFile }).token).toBe("example-token.with_segments");
    expect(inspect({ tokenFile, token: "explicit-token" }).token).toBe("explicit-token");
    expect(inspect({ tokenFile, token: "invalid bearer" }).token).toBeNull();
    expect(inspect({ tokenFile: await fixture("invalid bearer", true) }).token).toBeNull();
  });

  test("missing files and absent credentials are unconfigured", () => {
    expect(inspect({})).toEqual({ configured: false, cookies: false, token: null, account: null });
    expect(
      inspect({ tokenFile: join(directory, "missing"), cookiesFile: join(directory, "missing") }),
    ).toMatchObject({ configured: false, cookies: false, token: null });
  });

  test("accepts current Crunchyroll cookies including browser session cookies", async () => {
    for (const cookie of [
      { domain: ".crunchyroll.com", expirationDate: now / 1000 + 60 },
      { domain: "www.crunchyroll.com", expires: now / 1000 + 60 },
      { domain: "www.crunchyroll.com", expires: -1 },
      { domain: "www.crunchyroll.com", session: true },
    ]) {
      expect(
        inspect({ cookiesFile: await fixture([{ name: "session", value: "fixture", ...cookie }]) }),
      ).toMatchObject({ configured: true, cookies: true, token: null });
    }
  });

  test("rejects expired cookies, unrelated domains and malformed cookie files", async () => {
    for (const cookies of [
      [],
      {},
      [{ name: "session", value: "fixture", domain: "crunchyroll.com.evil.example" }],
      [{ name: "session", value: "fixture", domain: "evilcrunchyroll.com" }],
      [
        {
          name: "session",
          value: "fixture",
          domain: ".crunchyroll.com",
          expirationDate: now / 1000,
        },
      ],
      [{ name: "session", value: "fixture", domain: ".crunchyroll.com", expires: "tomorrow" }],
      [{ name: "session", value: "fixture", domain: ".crunchyroll.com", expirationDate: null }],
      [{ name: "session", value: "", domain: ".crunchyroll.com" }],
      [{ value: "fixture", domain: ".crunchyroll.com" }],
    ]) {
      expect(inspect({ cookiesFile: await fixture(cookies) })).toMatchObject({
        configured: false,
        cookies: false,
      });
    }
    expect(inspect({ cookiesFile: await fixture("{broken", true) }).cookies).toBe(false);
  });
});

describe("Crunchyroll canonical DBS_BEERUS catalogue", () => {
  test("resolves canonical episodes 1 through 5 by Crunchyroll ID, episode number, and Shenron ID", async () => {
    const { CrunchyrollClient } = await import("./client");
    const client = new CrunchyrollClient();
    const expected = [
      {
        crunchyrollId: "GE00389313JAJP",
        number: "1",
        shenronId: "875",
        slugTitle: "the-god-who-destroys",
        title: "Le dieu de la Destruction",
        airDate: "2026-10-11T00:00:00Z",
      },
      {
        crunchyrollId: "GE00389314JAJP",
        number: "2",
        shenronId: "876",
        slugTitle: "the-god-of-destruction-heads-to-the-planet-of-the-kai",
        title: "Le dieu de la Destruction se rend sur la planète de Kaïo",
        airDate: "2026-10-18T00:00:00Z",
      },
      {
        crunchyrollId: "GE00389315JAJP",
        number: "3",
        shenronId: "877",
        slugTitle: "the-god-of-destruction-heads-to-earth",
        title: "Le dieu de la Destruction se dirige vers la Terre",
        airDate: "2026-10-25T00:00:00Z",
      },
      {
        crunchyrollId: "GE00389316JAJP",
        number: "4",
        shenronId: "878",
        slugTitle: "the-god-of-saiyans",
        title: "Le dieu des Saiyans",
        airDate: "2026-11-01T00:00:00Z",
      },
      {
        crunchyrollId: "GE00389317JAJP",
        number: "5",
        shenronId: "879",
        slugTitle: "the-god-of-destruction-and-son-goku",
        title: "Le dieu de la Destruction et Son Goku",
        airDate: "2026-11-08T00:00:00Z",
      },
    ];
    for (const item of expected) {
      for (const query of [item.crunchyrollId, item.number, item.shenronId]) {
        const ep = await client.getEpisode(query);
        expect(ep).toMatchObject({
          id: item.crunchyrollId,
          seriesId: "GT00389311",
          episodeNumber: Number(item.number),
          title: item.title,
          slugTitle: item.slugTitle,
          airDate: item.airDate,
          watchUrl: `https://www.crunchyroll.com/fr/watch/${item.crunchyrollId}/${item.slugTitle}`,
        });
      }
    }
    const searchResults = await client.search("beerus");
    for (const item of expected) {
      expect(searchResults.some((entry) => entry.id === item.crunchyrollId)).toBe(true);
    }
  });
});
