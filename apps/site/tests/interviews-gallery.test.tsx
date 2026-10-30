// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, mock, test } from "bun:test";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import type { ToriyamaSourceGroup } from "../src/lib/toriyama-shared";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import fr from "../messages/interview-ui/fr.json";
import en from "../messages/interview-ui/en.json";
import ja from "../messages/interview-ui/ja.json";

const link = ({ href, children }: { href: string; children: ReactNode }) =>
  createElement("a", { href }, children);
mock.module("next/link", () => ({ default: link }));
mock.module("@/components/wiki/WikiImg", () => ({
  WikiImg: ({ src, alt }: { src: string | null; alt: string }) =>
    src
      ? createElement("img", { src, alt })
      : createElement("span", { "data-image-fallback": true }),
}));
const { InterviewsExplorer } = await import("../src/components/wiki/InterviewsExplorer");
const groups: ToriyamaSourceGroup[] = [
  {
    document: "Daizenshuu 2",
    documentKey: "daizenshuu-2",
    year: 1995,
    databookId: 2,
    kind: "interview",
    cover: "/wiki/daizenshuu2.webp",
    words: [
      {
        id: "one",
        subject: "Genèse",
        text: "Original Japanese",
        textFr: "Une création originale.",
        lang: "ja",
        source: "Daizenshuu 2, page 3",
        year: 1995,
        document: "Daizenshuu 2",
        href: "/wiki/databooks/2",
      },
    ],
  },
  {
    document: "Dragon Ball Super",
    documentKey: "super",
    year: 2016,
    databookId: 4,
    kind: "interview",
    cover: "javascript:private",
    words: [
      {
        id: "two",
        subject: "Toyotarō",
        text: "A new story",
        textFr: null,
        lang: "en",
        source: "Dragon Ball Super, page 1",
        year: 2016,
        document: "Dragon Ball Super",
        href: "/wiki/databooks/4",
      },
    ],
  },
];
const view = (locale: "fr" | "en" | "ja" = "fr", access?: AccessSnapshot) => (
  <NextIntlClientProvider locale={locale} messages={{}} timeZone="UTC">
    <InterviewsExplorer
      groups={groups}
      access={access}
      ragResults={[
        {
          title: "Corpus proof",
          url: "https://example.com/private",
          snippet: "private search snippet",
        },
      ]}
    />
  </NextIntlClientProvider>
);
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
});

test("gallery thumbnails and titles use all locales without printing quotations or RAG snippets", () => {
  for (const locale of ["fr", "en", "ja"] as const) {
    const html = renderToStaticMarkup(view(locale));
    expect(html).toContain({ fr, en, ja }[locale].search);
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("xl:grid-cols-8");
    expect(html).toContain("Daizenshuu 2");
    expect(html).toContain("/wiki/daizenshuu2.webp");
    expect(html).not.toContain("javascript:private");
    expect(html).not.toContain("Une création originale.");
    expect(html).not.toContain("private search snippet");
    expect(html).toContain("Corpus proof");
    expect(html).not.toContain("https://example.com/private");
  }
});

test("RAG titles with spaces or Japanese resolve to their rendered ASCII fragment targets", async () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="fr" messages={{}} timeZone="UTC">
      <InterviewsExplorer
        groups={[]}
        ragResults={[
          {
            title: "Corpus proof with spaces",
            url: "https://example.com/reference-one",
            snippet: "private reference one",
          },
          {
            title: "鳥山明 のインタビュー",
            url: "https://example.com/reference-two",
            snippet: "private reference two",
          },
          {
            title: "Public document",
            url: "/wiki/databooks/2",
            snippet: "private document excerpt",
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
  const targetIds = new Set<string>();
  const hrefs: string[] = [];
  await new HTMLRewriter()
    .on("li[id]", {
      element(element) {
        targetIds.add(element.getAttribute("id")!);
      },
    })
    .on("a[href]", {
      element(element) {
        hrefs.push(element.getAttribute("href")!);
      },
    })
    .transform(new Response(html))
    .text();
  const fragments = hrefs.filter((href) => new URL(href, "https://dragonballfr.com").hash);
  expect(fragments).toHaveLength(2);
  for (const href of fragments) {
    const target = decodeURIComponent(new URL(href, "https://dragonballfr.com").hash.slice(1));
    expect(target).toMatch(/^interview-rag-\d+$/);
    expect(targetIds.has(target)).toBe(true);
  }
  expect(hrefs).toContain("/wiki/databooks/2");
  expect(html).not.toContain("private reference one");
  expect(html).not.toContain("private reference two");
  expect(html).not.toContain("private document excerpt");
});

test.skipIf(typeof document === "undefined")(
  "search, decade filtering and opening a source retain editorial quotations",
  async () => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(view()));
    await act(async () =>
      container!.querySelector<HTMLButtonElement>('[data-interview="daizenshuu-2"]')!.click(),
    );
    const detail = container.querySelector("#interview-document")!;
    expect(document.activeElement).toBe(detail);
    expect(detail.textContent).toContain("Une création originale.");
    expect(detail.textContent).toContain("Daizenshuu 2, page 3");
    expect(detail.textContent).toContain(fr.translated);
    expect(detail.querySelector('a[href="/wiki/databooks/2"]')).not.toBeNull();
    await act(async () =>
      [...container!.querySelectorAll("button")]
        .find((button) => button.textContent === fr.eras["2010s"])!
        .click(),
    );
    expect(container.querySelector('[data-interview="daizenshuu-2"]')).toBeNull();
    expect(container.querySelector('[data-interview="super"]')).not.toBeNull();
    expect(container.querySelector("#interview-document")).toBeNull();
    await act(async () =>
      [...container!.querySelectorAll("button")]
        .find((button) => button.textContent === fr.eras.all)!
        .click(),
    );
    const input = container.querySelector<HTMLInputElement>("#interview-search")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "genese",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[data-interview="daizenshuu-2"]')).not.toBeNull();
    expect(container.querySelector('[data-interview="super"]')).toBeNull();
  },
);

test.skipIf(typeof document === "undefined")(
  "closed source documents remain inert after opening an interview",
  async () => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(view("fr", { openKeys: [] })));
    await act(async () =>
      container!.querySelector<HTMLButtonElement>('[data-interview="daizenshuu-2"]')!.click(),
    );
    const detail = container.querySelector("#interview-document")!;
    expect(detail.querySelector('a[href="/wiki/databooks/2"]')).toBeNull();
    expect(detail.querySelector('[aria-disabled="true"]')).not.toBeNull();
    expect(detail.textContent).toContain("Une création originale.");
  },
);
