// SPDX-License-Identifier: Apache-2.0
import { expect, spyOn, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { CharacterSagaVariants } from "../src/components/wiki/CharacterSagaVariants";
import { CharacterSagaVariantsTabs } from "../src/components/wiki/CharacterSagaVariantsTabs";
import type { CharacterVariant } from "../src/lib/shenron";
import type { AccessSnapshot } from "../src/lib/wiki-launch";

function variant(id: number, label: string, summary: string): CharacterVariant {
  return {
    id,
    slug: `goku-${id}`,
    label,
    displayName: null,
    nameJa: null,
    form: null,
    image: null,
    age: null,
    powerLevel: null,
    ki: null,
    maxKi: null,
    role: null,
    affiliation: null,
    summary,
    highlights: null,
    firstVolume: null,
    lastVolume: null,
    firstEpisode: null,
    lastEpisode: null,
    keyEpisodes: null,
    episodeSeries: null,
    origin: "editorial",
    evidence: null,
    sagaId: id,
    sagaName: label,
    sagaSlug: `saga-${id}`,
    sagaSeries: "DBZ",
    sagaImage: null,
  };
}

const variants = [
  variant(
    1,
    "Saga Saiyan",
    "**First era** [Source](https://dragonballfr.com/wiki/characters/goku)",
  ),
  { ...variant(2, "Saga Namek", "**Second era** <script>alert(1)</script>"), origin: "ocr-manga" },
];

function serverResult(access?: AccessSnapshot) {
  return CharacterSagaVariants({ variants, characterName: "Goku", characterImage: null, access })!;
}

test("server summaries retain formatted links and sanitization", () => {
  const { summaryNodes } = serverResult().props;
  const first = renderToStaticMarkup(summaryNodes[0]);
  const second = renderToStaticMarkup(summaryNodes[1]);
  expect(first).toContain("<strong>First era</strong>");
  expect(first).toContain('href="https://dragonballfr.com/wiki/characters/goku"');
  expect(second).toContain("<strong>Second era</strong>");
  expect(second).not.toContain("<script");
  expect(second).not.toContain("alert(1)");
  expect(
    CharacterSagaVariants({ variants: [], characterName: "Goku", characterImage: null }),
  ).toBeNull();
});

const domTest = test.skipIf(typeof document === "undefined");

async function withTabs(
  access: AccessSnapshot | undefined,
  run: (container: HTMLDivElement) => Promise<void>,
) {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalAct = globals.IS_REACT_ACT_ENVIRONMENT;
  const previousURL = window.location.href;
  const previousScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    value() {},
    configurable: true,
  });
  const frame = spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    // Flight delivers already rendered server slots, never the Markdown parser.
    const result = serverResult(access);
    const summaryNodes = result.props.summaryNodes.map((node: ReactNode, index: number) => (
      <div key={index} dangerouslySetInnerHTML={{ __html: renderToStaticMarkup(node) }} />
    ));
    await act(async () =>
      root.render(<CharacterSagaVariantsTabs {...result.props} summaryNodes={summaryNodes} />),
    );
    await run(container);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    frame.mockRestore();
    globals.IS_REACT_ACT_ENVIRONMENT = originalAct;
    window.location.href = previousURL;
    if (previousScroll)
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previousScroll);
    else
      delete (HTMLElement.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView;
  }
}

domTest(
  "keyboard tabs select the matching server summary and share a valid ARIA panel",
  async () => {
    window.location.href = "https://variants.test/#saga-1";
    await withTabs(undefined, async (container) => {
      const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const panel = container.querySelector('[role="tabpanel"]')!;
      expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0]!.id);
      expect(tabs[0]!.getAttribute("aria-controls")).toBe(panel.id);
      expect(container.querySelector(".prose-invert a")?.getAttribute("href")).toBe(
        "https://dragonballfr.com/wiki/characters/goku",
      );
      await act(async () => {
        tabs[0]!.focus();
        tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      });
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
      expect(tabs[0]!.tabIndex).toBe(-1);
      expect(panel.getAttribute("aria-labelledby")).toBe(tabs[1]!.id);
      expect(panel.textContent).toContain("Second era");
      expect(panel.textContent).not.toContain("First era");
      expect(panel.textContent).toContain("Relevé automatique");
      expect(window.location.hash).toBe("#saga-2");
      await act(async () =>
        tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })),
      );
      expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
      expect(panel.textContent).toContain("First era");
    });
  },
);

domTest(
  "deep hashes activate known sagas, unknown hashes preserve selection, access stays gated",
  async () => {
    window.location.href = "https://variants.test/#saga-2";
    expect(window.location.hash).toBe("#saga-2");
    await withTabs(
      { openKeys: [], access: { sagas: { mode: "admin", roleIds: [] } } },
      async (container) => {
        const panel = container.querySelector('[role="tabpanel"]')!;
        expect(panel.textContent).toContain("Second era");
        expect(panel.querySelector('a[href="/wiki/sagas/saga-2"]')).toBeNull();
        expect(panel.querySelector('[aria-disabled="true"]')).not.toBeNull();
        await act(async () => {
          window.location.hash = "#saga-999999";
          window.dispatchEvent(new Event("hashchange"));
        });
        expect(panel.textContent).toContain("Second era");
        await act(async () => {
          window.location.hash = "#saga-1";
          window.dispatchEvent(new Event("hashchange"));
        });
        expect(panel.textContent).toContain("First era");
        expect(panel.textContent).not.toContain("Relevé automatique");
      },
    );
  },
);
