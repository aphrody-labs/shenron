// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "bun:test";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { importCrunchyrollArchive } from "./crunchyroll-har-import";

test("complete conversion is readable by the backend CLI without printing secrets", async () => {
  const root = resolve("var/reports/crunchyroll-import-tests", crypto.randomUUID());
  try {
    const original = {
      log: {
        version: "1.2",
        entries: [
          {
            startedDateTime: "2026-10-25T17:00:00Z",
            request: {
              method: "POST",
              url: "https://www.crunchyroll.com/auth/v1/token",
              headers: [],
            },
            response: {
              status: 200,
              content: {
                text: JSON.stringify({
                  access_token: "fixture-private-access",
                  refresh_token: "fixture-private-refresh",
                  expires_in: 300,
                }),
              },
            },
          },
        ],
      },
    };
    await Bun.write(join(root, "source.har"), JSON.stringify(original));
    await Bun.write(
      join(root, "source-cookies.json"),
      JSON.stringify([
        {
          name: "fixture",
          value: "fixture-private-cookie",
          domain: ".crunchyroll.com",
          path: "/",
          session: true,
        },
      ]),
    );
    const result = await importCrunchyrollArchive(
      join(root, "source.har"),
      join(root, "source-cookies.json"),
      join(root, "home"),
    );
    const backend = await Bun.file(join(result.root, "backend.json")).json();
    expect(backend.archive).toEqual(original);
    expect(backend.cookies[0].value).toBe("fixture-private-cookie");
    expect(backend.sessions[0].refreshToken).toBe("fixture-private-refresh");
    expect(JSON.stringify(result)).not.toContain("fixture-private");
    for (const command of ["status", "import-status"]) {
      const proc = Bun.spawn(
        [
          process.execPath,
          "packages/crunchyroll/src/cli.ts",
          command,
          "--import-home",
          join(root, "home"),
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [out, err, exit] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect(exit).toBe(0);
      expect(err).toBe("");
      expect(out).not.toContain("fixture-private");
      const status = JSON.parse(out);
      if (command === "status")
        expect(status).toMatchObject({
          hasCookies: true,
          hasToken: false,
          providerVerified: false,
        });
      else expect(status).toMatchObject({ configured: true, entryCount: 1, sessionCount: 1 });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
