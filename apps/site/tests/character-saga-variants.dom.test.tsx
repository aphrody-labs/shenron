// SPDX-License-Identifier: Apache-2.0
import { expect, spyOn, test } from "bun:test";
import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { CharacterSagaVariants } from "../src/components/wiki/CharacterSagaVariants";
import { CharacterSagaVariantsTabs } from "../src/components/wiki/CharacterSagaVariantsTabs";
import type { CharacterVariant } from "../src/lib/shenron";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";

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
    transformationIds: null,
    techniqueIds: null,
    sagaId: id,
    sagaName: label,
    sagaSlug: `saga-${id}`,
    sagaSeries: "DBZ",
    sagaImage: null,
  };
}

const variants: CharacterVariant[] = [
  variant(
    1,
    "Saga Saiyan",
    "**First era** [Source](https://dragonballfr.com/wiki/characters/goku)",
  ),
  {
    ...variant(2, "Saga Namek", "**Second era** <script>alert(1)</script>"),
    origin: "ocr-manga",
    image: "/images/goku-namek-generated.webp",
    evidence: {
      methode: "ocr-manga",
      tomes: [24],
      planches: 1,
      graphies: ["Son Goku"],
      mesureAt: 1,
      imageArtwork: {
        kind: "generated",
        image: "/images/goku-namek-generated.webp",
        referenceUrl: "https://dragonballfr.com/wiki/manga/1443?page=134",
        referenceImageUrl: "https://dragonballfr.com/assets/manga/DB/regular/vol24/134.webp",
        referenceTitle: "Dragon Ball, tome 24, page 134",
        referenceSha256: "a".repeat(64),
        outputSha256: "b".repeat(64),
        generatedAt: "2026-10-26T00:00:00.000Z",
        generator: "image_gen",
      },
      editorialReferences: [
        {
          fields: ["image"],
          url: "https://dragonballfr.com/wiki/manga/1443?page=134",
          title: "Dragon Ball volume 24",
          locator: "page 134",
        },
      ],
    } as unknown as CharacterVariant["evidence"],
  },
];

const messages = {
  intro: "{count} versions",
  overview: "Overview",
  chooseVersion: "Choose a version",
  tabsLabel: "Versions of {name}",
  form: "Form",
  age: "Age",
  years: "years",
  affiliation: "Affiliation",
  manga: "Manga",
  animatedSeries: "Animated series",
  mangaPages: "Manga pages",
  episodeSynopses: "Episode synopses",
  imageReference: "View source",
  noImage: "No version-specific image has been verified yet.",
  noSummary: "No summary",
  powerAria: "Power for {name} — {version}",
  powerHeading: "Power readings — {version}",
  powerLevel: "Level",
  ki: "Ki",
  maxKi: "Maximum ki",
  noPower: "No power reading",
  transformationsAria: "Transformations for {name} — {version}",
  transformations: "Transformations",
  noTransformations: "No transformations recorded",
  techniquesAria: "Techniques for {name} — {version}",
  techniques: "Techniques",
  noTechniques: "No techniques recorded",
  episodesNamed: "Episodes named after the character",
  volumesRange: "volumes {range}",
  volumeSingle: "volume {number}",
  episodesRange: "episodes {range}",
  episodeSingle: "episode {number}",
  officialReadings: "Official readings",
  scouterSource: "manga scouter",
  daizenshuuSource: "Daizenshuu 7",
  bpUnit: "BP",
  autoSynopsis: "Automatically detected in episode synopses",
  autoManga: "Automatically detected in manga pages",
  autoBoth: "Automatically detected in manga pages and episode synopses",
};

function serverResult(
  access?: AccessSnapshot,
): ReactElement<React.ComponentProps<typeof CharacterSagaVariantsTabs>> {
  const result = CharacterSagaVariants({
    variants,
    characterName: "Goku",
    access,
    children: <div>General article text</div>,
    messages,
    powerScalingNodes: [<span key="first">Saiyan BP</span>, <span key="second">Namek BP</span>],
    transformationNodes: [<span key="first">Oozaru</span>, <span key="second">Super Saiyan</span>],
    techniqueNodes: [
      <span key="first">Kamehameha</span>,
      <span key="second">Special Beam Cannon</span>,
    ],
  });
  if (!isValidElement(result)) throw new Error("Expected a character version selector");
  return result as ReactElement<React.ComponentProps<typeof CharacterSagaVariantsTabs>>;
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
    CharacterSagaVariants({
      variants: [],
      characterName: "Goku",
      messages,
      powerScalingNodes: [],
      transformationNodes: [],
      techniqueNodes: [],
    }),
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
      // oxlint-disable-next-line react/no-array-index-key -- static list without stable ids
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
  "overview and saga tabs replace the full article content and share one keyboard stop",
  async () => {
    window.location.href = "https://variants.test/";
    await withTabs(undefined, async (container) => {
      const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const panel = container.querySelector('[role="tabpanel"]')!;
      const tablist = container.querySelector('[role="tablist"]')!;
      expect(tablist.getAttribute("tabindex")).toBeNull();
      expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
      expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0]!.id);
      expect(tabs[0]!.getAttribute("aria-controls")).toBe(panel.id);
      expect(panel.textContent).toContain("General article text");
      expect(panel.textContent).not.toContain("First era");
      await act(async () => {
        tabs[0]!.focus();
        tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      });
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs[1]!.getAttribute("aria-selected")).toBe("true");
      expect(panel.getAttribute("aria-labelledby")).toBe(tabs[1]!.id);
      expect(panel.textContent).toContain("First era");
      expect(panel.textContent).not.toContain("General article text");
      expect(panel.textContent).toContain("Oozaru");
      expect(panel.textContent).toContain("Kamehameha");
      expect(panel.textContent).toContain("Saiyan BP");
      expect(
        panel.querySelector(
          '[role="img"][aria-label="No version-specific image has been verified yet."]',
        ),
      ).not.toBeNull();
      await act(async () =>
        tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
      );
      expect(document.activeElement).toBe(tabs[2]);
      expect(tabs[2]!.getAttribute("aria-selected")).toBe("true");
      expect(panel.getAttribute("aria-labelledby")).toBe(tabs[2]!.id);
      expect(panel.textContent).toContain("Second era");
      expect(panel.textContent).not.toContain("First era");
      expect(panel.textContent).toContain("Super Saiyan");
      expect(panel.textContent).not.toContain("Oozaru");
      expect(panel.textContent).toContain("Special Beam Cannon");
      expect(panel.textContent).not.toContain("Kamehameha");
      expect(panel.textContent).toContain("Namek BP");
      expect(panel.querySelector('img[src="/images/goku-namek-generated.webp"]')).toBeNull();
      expect(
        panel.querySelector('a[aria-label="View source: Dragon Ball volume 24, page 134"]'),
      ).toBeNull();
      expect(panel.textContent).not.toContain("Saiyan BP");
      expect(panel.textContent).toContain("Automatically detected");
      expect(panel.textContent).not.toContain("Generated illustration");
      expect(window.location.hash).toBe("#saga-2");
      await act(async () =>
        tabs[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })),
      );
      expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
      expect(panel.textContent).toContain("General article text");
      expect(panel.textContent).not.toContain("Second era");
      expect(window.location.hash).toBe("");
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
