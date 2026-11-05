// SPDX-License-Identifier: Apache-2.0
import "./dom-preload";
import { expect, test } from "bun:test";
import { act } from "react";
import { getWikiPortalMessages } from "../src/lib/wiki-character-version-messages";
import { portalUiMessages } from "../src/lib/wiki-portal-messages";
import { wikiPortalMascots } from "../src/lib/wiki-portal-artwork";
import fr from "../messages/wiki-portal/fr.json";
import en from "../messages/wiki-portal/en.json";
import ja from "../messages/wiki-portal/ja.json";
const { renderToStaticMarkup } = await import("react-dom/server");
const { createRoot } = await import("react-dom/client");
const { WikiPortalIdentity, WikiPortalPublications } =
  await import("../src/components/wiki/WikiPortalIdentity");
const mascots = wikiPortalMascots(
  [
    { id: 1, name: "Goku", image: "/dbz/characters/goku.webp" },
    { id: 90, name: "Kid Buu", image: "/dbz/transformations/majin-buu-pure.webp" },
  ],
  [{ id: 1, slug: "shenron", name: "Shenron", image: "/wiki/characters/Shenron.webp" }],
);

test("mascots render as three compact controls and a real entry link without a hero", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <WikiPortalIdentity mascots={mascots} initialKey="kid-buu" />,
  );
  expect(container.querySelectorAll("button")).toHaveLength(3);
  expect(container.querySelectorAll("img")).toHaveLength(3);
  expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toContain("Kid Buu");
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/wiki/characters/90");
  expect(container.querySelector("h1")).toBeNull();
});

test("a native mascot button updates the linked entry while keeping keyboard focus", async () => {
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<WikiPortalIdentity mascots={mascots} initialKey="goku" />));
    const button = container.querySelectorAll("button")[2]!;
    button.focus();
    await act(async () => button.click());
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "/wiki/characters#dragon-shenron",
    );
    expect(container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globals.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test("portal labels are plain text, not double escaped entities or injected HTML", () => {
  const container = document.createElement("div");
  for (const locale of ["fr", "en", "ja"]) {
    const p = getWikiPortalMessages(locale);
    container.innerHTML = renderToStaticMarkup(
      <div>
        <p>{p("sectionUniverse")}</p>
        <p>{p("quickSearchTitle")}</p>
        <p>{p("lead", { total: "<script>unsafe</script>" })}</p>
      </div>,
    );
    expect(container.textContent).not.toContain("&amp;");
    expect(container.querySelector("script")).toBeNull();
  }
  expect(Object.keys(fr).toSorted()).toEqual(Object.keys(en).toSorted());
  expect(Object.keys(fr).toSorted()).toEqual(Object.keys(ja).toSorted());
  expect(portalUiMessages("ja")("search")).toBe("検索");
});

test("release cards retain the actual catalogue publication date and destination", () => {
  const container = document.createElement("div");
  const date = Date.UTC(2025, 1, 4);
  container.innerHTML = renderToStaticMarkup(
    <WikiPortalPublications
      items={[
        {
          id: "manga-782",
          title: "Dragon BallSD11",
          href: "/wiki/manga/volume/782",
          date,
          image: "/cover.jpg",
        },
      ]}
    />,
  );
  expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(
    "2025-02-04T00:00:00.000Z",
  );
  expect(container.querySelector("a")?.getAttribute("href")).toBe("/wiki/manga/volume/782");
  expect(container.textContent).toContain("2025");
});
