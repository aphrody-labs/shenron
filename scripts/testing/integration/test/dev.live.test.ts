// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { join } from "node:path";
import { startEngine } from "@aphrody/agent-browser/engine";
import { TestPage, expect as webExpect } from "@aphrody/web-test";
import { instant, INSTANT_COOKIE, adaptPage } from "@aphrody/web-test/next";
import { createShenronApiClient } from "@shenron/api/client";
import { freePort } from "../../../../apps/server/src/front";
import { createFixture } from "../fixture";

test.skipIf(process.env.SHENRON_WEB_LIVE !== "1")(
  "real Next development UI reaches the Bun API through Obscura",
  async () => {
    const port = freePort();
    const fixture = createFixture(port);
    const timestamp = new Date().toISOString();
    await fixture.host.conversations!.push("local", {
      conversations: [
        {
          id: "qualification-thread",
          surface: "desktop",
          title: "Qualification temporaire",
          persona: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
          memoryOptIn: false,
          ragOptIn: false,
          metadata: {},
        },
      ],
      messages: [
        {
          id: "qualification-message",
          conversationId: "qualification-thread",
          role: "assistant",
          content: "Message synthétique de qualification",
          citations: [],
          model: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        },
      ],
    });
    const site = join(import.meta.dir, "../../../../apps/site");
    const logPath = join(import.meta.dir, "../../../../var/reports/integration/next.log");
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_DIST_DIR: ".next-qualification",
      SKIP_ENV_VALIDATION: "1",
      DATABASE_URL: "postgres://qualification:qualification@127.0.0.1:9/qualification",
      BETTER_AUTH_SECRET: "qualification-only-not-a-production-key",
      DISCORD_CLIENT_ID: "000000000000000000",
      DISCORD_CLIENT_SECRET: "qualification-only",
      SHENRON_HOST_URL: fixture.url,
      SHENRON_API_URL: fixture.url,
      SHENRON_ADMIN_IPS: "",
      NEXT_PUBLIC_SITE_URL: fixture.url,
    };
    const child = Bun.spawn(
      [
        process.execPath,
        "--bun",
        "next",
        "dev",
        "--turbopack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: site,
        env,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    // Drain both streams immediately; large compiler diagnostics must not block the server.
    const output = Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    let engine: Awaited<ReturnType<typeof startEngine>> | undefined;
    let page: TestPage | undefined;
    const diagnostics: { method: string; params: Record<string, unknown> }[] = [];
    const diagnosticCounts = { runtime: 0, network: 0 };
    try {
      const deadline = Date.now() + 120_000;
      let ready = false;
      while (Date.now() < deadline && child.exitCode === null) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/desktop`, {
            // Cold SSR also waits for the fixture's unavailable database fallbacks.
            signal: AbortSignal.timeout(Math.min(15_000, deadline - Date.now())),
          });
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {
          /* startup/compilation still pending */
        }
        await Bun.sleep(250);
      }
      expect(ready).toBe(true);
      engine = await startEngine({
        binary: process.env.APHRODY_WEB_BIN ?? Bun.which("aphrody-web") ?? undefined,
        allowPrivateNetwork: true,
      });
      page = await TestPage.create({ cdpUrl: engine.endpoint, baseURL: fixture.url });
      for (const method of [
        "Runtime.exceptionThrown",
        "Runtime.consoleAPICalled",
        "Network.requestWillBeSent",
        "Network.responseReceived",
        "Network.loadingFailed",
        "Network.loadingFinished",
      ])
        page.raw.view.addEventListener(method, (event) => {
          const params = (event as Event & { data?: Record<string, unknown> }).data ?? {};
          const channel = method.startsWith("Runtime.")
            ? "runtime"
            : method.startsWith("Network.")
              ? "network"
              : null;
          if (channel && diagnosticCounts[channel] < (channel === "runtime" ? 100 : 400)) {
            diagnosticCounts[channel]++;
            diagnostics.push({ method, params });
          }
        });
      await page.raw.cdp("Page.addScriptToEvaluateOnNewDocument", {
        source:
          "globalThis.__qualificationErrors=[];(()=>{const record=value=>{if(__qualificationErrors.length<100)__qualificationErrors.push(String(value))};addEventListener('error',e=>record(e.error?.stack||e.message));addEventListener('unhandledrejection',e=>record(e.reason?.stack||e.reason))})();",
      });
      const response = await page.goto("/desktop");
      expect(response.status).toBe(200);
      await webExpect(page.locator("main")).toBeVisible({ timeout: 30_000 });
      await webExpect(page.getByRole("button", { name: /Qualification temporaire/ })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: /Qualification temporaire/ }).click();
      await webExpect(
        page.getByText("Message synthétique de qualification", { exact: true }),
      ).toBeVisible();
      await webExpect(page.getByText("Connexion au serveur local…", { exact: true })).toHaveCount(
        0,
        { timeout: 30_000 },
      );
      await webExpect(page.getByRole("button", { name: "Nouvelle discussion" })).toBeVisible();
      await page.getByRole("button", { name: "Nouvelle discussion" }).click();
      const api = createShenronApiClient({ baseUrl: fixture.url });
      expect((await api.wiki.get("characters", "son-goku")).ok).toBe(true);
      const fromBrowser = await page.raw.evaluate<{ status: number; count: number }>(
        `fetch('/api/public/wiki/categories').then(async r => ({status:r.status,count:(await r.json()).categories.find(c=>c.name==='characters').total}))`,
      );
      expect(fromBrowser).toEqual({ status: 200, count: 2 });
      const health = await page.raw.evaluate<{ status: number; conversations: boolean }>(
        `fetch('/api/local/health').then(async r => ({status:r.status,conversations:(await r.json()).groups.conversations.available}))`,
      );
      expect(health).toEqual({ status: 200, conversations: true });
      // Exercise the real Next-specific adapter and prove its lock is always released.
      await instant(page, async () => {
        const cookies = await adaptPage(page!).context().cookies();
        expect(cookies.some((cookie) => cookie.name === INSTANT_COOKIE)).toBe(true);
      });
      expect(
        (await adaptPage(page!).context().cookies()).some(
          (cookie) => cookie.name === INSTANT_COOKIE,
        ),
      ).toBe(false);
      await Bun.write(
        join(import.meta.dir, "../../../../var/reports/integration/desktop.png"),
        await page.raw.screenshot(),
      );
    } finally {
      if (page) {
        await Bun.write(
          join(import.meta.dir, "../../../../var/reports/integration/browser.json"),
          JSON.stringify(
            {
              diagnostics,
              state: await page.raw
                .evaluate(
                  "({ready:document.readyState, scripts:[...document.scripts].map(s=>s.src), text:document.body.innerText, errors:globalThis.__qualificationErrors, next:typeof globalThis.next, turbopack:Array.isArray(globalThis.TURBOPACK)?globalThis.TURBOPACK.length:typeof globalThis.TURBOPACK})",
                )
                .catch(String),
            },
            null,
            2,
          ),
        );
        await Bun.write(
          join(import.meta.dir, "../../../../var/reports/integration/desktop.png"),
          await page.raw.screenshot().catch(() => new Uint8Array()),
        );
      }
      await page?.close();
      await engine?.stop();
      child.kill("SIGTERM");
      const forced = setTimeout(() => child.kill("SIGKILL"), 3000);
      await child.exited;
      clearTimeout(forced);
      const logs = await output;
      await Bun.write(logPath, logs.join("\n"));
      await fixture.close();
    }
  },
  180_000,
);
