// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import messages from "../messages/fr.json";

mock.module("next/dynamic", () => ({ default: () => () => <div data-editor-ready /> }));
mock.module("@aphrody/shenron-ui/studio/tauri-bridge", () => ({ isTauri: () => false }));
mock.module("@aphrody/shenron-ui/koharu", () => ({ preloadCanvasModule: async () => true }));
const { StudioEditor } = await import("../src/app/studio/StudioEditor");
await import("@aphrody/shenron-koharu/transport");
const originalFetch = globalThis.fetch;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalAct = environment.IS_REACT_ACT_ENVIRONMENT;
let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  globalThis.fetch = originalFetch;
  environment.IS_REACT_ACT_ENVIRONMENT = originalAct;
});

async function render(status: number) {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) =>
      String(input) === "/api/local/health"
        ? Response.json({ service: "shenron-server", groups: {} })
        : Response.json({ available: status === 200 }, { status }),
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <NextIntlClientProvider locale="fr" messages={messages}>
        <StudioEditor fallback={<div data-presentation />} />
      </NextIntlClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

test.skipIf(typeof document === "undefined")("a guest gets an explicit sign-in entry", async () => {
  await render(401);
  expect(host!.querySelector("button")?.textContent).toBe(messages.library.studio.webSignIn);
  expect(host!.querySelector("[data-presentation]")).not.toBeNull();
  expect(host!.querySelector("[data-editor-ready]")).toBeNull();
});

test.skipIf(typeof document === "undefined")(
  "an unavailable engine never looks like a sign-in request",
  async () => {
    await render(503);
    expect(host!.querySelector('[role="status"]')?.textContent).toBe(
      messages.library.studio.webUnavailable,
    );
    expect(host!.querySelector("button")).toBeNull();
    expect(host!.querySelector("[data-editor-ready]")).toBeNull();
  },
);

test.skipIf(typeof document === "undefined")(
  "an authenticated healthy engine opens the shared editor",
  async () => {
    await render(200);
    expect(host!.querySelector("[data-editor-ready]")).not.toBeNull();
    expect(host!.querySelector("[data-presentation]")).toBeNull();
  },
);
