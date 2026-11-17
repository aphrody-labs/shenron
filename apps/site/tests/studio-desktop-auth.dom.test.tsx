// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";

mock.module("next/dynamic", () => ({ default: () => () => null }));
mock.module("@aphrody/shenron-ui/studio/tauri-bridge", () => ({ isTauri: () => true }));

const { StudioEditor } = await import("../src/app/studio/StudioEditor");
const messages = (await import("../messages/fr.json")).default;
const originalFetch = globalThis.fetch;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  globalThis.fetch = originalFetch;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

test.skipIf(typeof document === "undefined")(
  "the desktop editor reflects account linking completed in the system browser",
  async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    let statusChecks = 0;
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST")
          return Response.json({ url: "https://dragonballfr.com/api/desktop/link" });
        statusChecks++;
        return Response.json({ signedIn: statusChecks > 1 });
      },
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <NextIntlClientProvider locale="fr" messages={messages}>
          <StudioEditor fallback={null} />
        </NextIntlClientProvider>,
      );
    });
    expect(container.textContent).toContain("Lier mon compte Discord");

    await act(async () => {
      container!.querySelector("button")!.click();
      await Bun.sleep(1_050);
    });

    expect(statusChecks).toBeGreaterThan(1);
    expect(container.textContent).not.toContain("Terminez la connexion");
    expect(container.querySelector("button")).toBeNull();
  },
);

test.skipIf(typeof document === "undefined")(
  "the desktop login gate reports a failed local account-link request",
  async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "POST"
          ? Response.json({ error: "unavailable" }, { status: 503 })
          : Response.json({ signedIn: false }),
      { preconnect: originalFetch.preconnect },
    ) as typeof fetch;

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <NextIntlClientProvider locale="fr" messages={messages}>
          <StudioEditor fallback={null} />
        </NextIntlClientProvider>,
      );
    });
    await act(async () => {
      container!.querySelector("button")!.click();
    });

    expect(container.textContent).toContain("Impossible de démarrer la liaison du compte");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  },
);
