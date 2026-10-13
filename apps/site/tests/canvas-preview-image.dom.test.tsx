import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { CanvasPreviewImage } from "../src/components/admin/CanvasPreviewImage";

const originalFetch = globalThis.fetch;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const messages = {
  common: { loading: "Chargement" },
  adminCanvas: {
    profileUnavailable: "Ce profil est indisponible.",
    previewUnavailable: "Impossible de charger cet aperçu.",
  },
};
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let client: QueryClient | undefined;
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = globals.IS_REACT_ACT_ENVIRONMENT;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  client?.clear();
  root = undefined;
  container = undefined;
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  globals.IS_REACT_ACT_ENVIRONMENT = previousAct;
});

async function mount(status: number, profile = true) {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = Object.assign(
    async () =>
      status === 200
        ? new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { "content-type": "image/png" },
          })
        : Response.json({ error: "unavailable" }, { status }),
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client!}>
        <NextIntlClientProvider locale="fr" messages={messages} timeZone="Europe/Paris">
          <CanvasPreviewImage
            src="/api/bot-admin/canvas/profile/11111111111111111"
            alt="Profile"
            profile={profile}
          />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

test.skipIf(typeof document === "undefined")(
  "a profile 404 displays a localized unavailable state without a broken image",
  async () => {
    await mount(404);
    expect(container!.textContent).toContain(messages.adminCanvas.profileUnavailable);
    expect(container!.querySelector("img")).toBeNull();
  },
);

test.skipIf(typeof document === "undefined")(
  "a forbidden or failing renderer is not described as a missing profile",
  async () => {
    await mount(500);
    expect(container!.textContent).toContain(messages.adminCanvas.previewUnavailable);
    expect(container!.textContent).not.toContain(messages.adminCanvas.profileUnavailable);
    expect(container!.querySelector("img")).toBeNull();
  },
);

test.skipIf(typeof document === "undefined")(
  "a successful preview creates and revokes its image resource",
  async () => {
    const revoked: string[] = [];
    URL.createObjectURL = () => "blob:canvas-preview";
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
    };
    await mount(200);
    expect(container!.querySelector("img")?.getAttribute("src")).toBe("blob:canvas-preview");
    await act(async () => root!.unmount());
    root = undefined;
    expect(revoked).toEqual(["blob:canvas-preview"]);
  },
);
