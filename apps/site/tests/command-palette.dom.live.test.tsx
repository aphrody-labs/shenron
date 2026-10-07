import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let locale = "en";
const destinations: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => destinations.push(url) }),
}));
mock.module("next-intl", () => ({ useLocale: () => locale }));
mock.module("@/lib/telemetry", () => ({ track: () => {} }));
mock.module("@/lib/assets", () => ({ assetUrl: (url: string) => url }));
const { default: CommandPalette } = await import("../src/components/CommandPalette");
let root: Root;
let container: HTMLDivElement;
const originalFetch = globalThis.fetch;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  globalThis.fetch = originalFetch;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});

test.skipIf(typeof document === "undefined")(
  "the real palette restores books and novels and localizes the dialog",
  async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const keys = [
      "characters",
      "planets",
      "sagas",
      "movies",
      "games",
      "episodes",
      "techniques",
      "races",
      "transformations",
      "arcs",
      "mangaVolumes",
      "mangaChapters",
      "battles",
      "locations",
      "tournaments",
      "voiceActors",
      "soundtracks",
      "powerLevels",
      "items",
      "dragons",
      "contributors",
      "sources",
    ];
    const payload = {
      ...Object.fromEntries(keys.map((key) => [key, []])),
      q: "guide",
      databooks: [{ id: 7, title: "Daizenshuu", title_ja: null, category: null, cover: null }],
      novels: [
        {
          id: 8,
          title: "Broly novel",
          title_ja: null,
          publication_type: "light_novel",
          cover: null,
        },
      ],
    };
    globalThis.fetch = Object.assign(async () => Response.json(payload), {
      preconnect: originalFetch.preconnect,
    }) as typeof fetch;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<CommandPalette open onOpenChange={() => {}} />));
    const input = document.querySelector("input")!;
    expect(input.placeholder).toContain("A character");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "guide",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await Bun.sleep(250);
    });
    expect(document.body.textContent).toContain("Databooks & guides");
    expect(document.body.textContent).toContain("Novels & light novels");
    expect(document.body.textContent).toContain("Daizenshuu");
    expect(document.body.textContent).toContain("Broly novel");
    expect(document.body.textContent).not.toContain("No energy detected");
    await act(async () =>
      document
        .querySelector('[cmdk-item][data-value="databook-7-Daizenshuu"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(destinations).toContain("/wiki/databooks/7");
    locale = "ja";
    await act(async () => root.render(<CommandPalette open onOpenChange={() => {}} />));
    expect(document.querySelector("input")!.placeholder).toContain("キャラクター");
  },
);
