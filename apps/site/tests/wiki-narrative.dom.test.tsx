// SPDX-License-Identifier: Apache-2.0
import "./dom-preload";
import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Battle } from "../src/lib/db-universe";

mock.module("next/navigation", () => ({
  usePathname: () => "/wiki/events",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
// This suite exercises catalogue state and image identity; actual image loading is covered in Playwright.
mock.module("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));
const { NarrativeEventsExplorer } = await import("../src/components/wiki/NarrativeEventsExplorer");
const { TransformationsCatalogue } =
  await import("../src/components/wiki/TransformationsCatalogue");
const { TransformationTreesView } = await import("../src/components/wiki/TransformationTreesView");

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

test("form filters keep article navigation and never replace a missing form with its user's portrait", async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <TransformationsCatalogue
        groups={[
          {
            name: "Super Saiyan",
            image: null,
            ki: null,
            members: [{ id: 1, slug: "goku", name: "Goku", image: "/artwork/base.png" }],
            ficheId: 1,
            ficheSlug: "super-saiyan",
          },
          {
            name: "Forme illustrée",
            image: "/artwork/form.png",
            ki: null,
            members: [],
            ficheId: null,
            ficheSlug: null,
          },
        ]}
      />,
    ),
  );
  expect(container.querySelectorAll("article")).toHaveLength(2);
  const firstCard = container.querySelector("article")!;
  expect(firstCard.firstElementChild?.querySelector("img")).toBeNull();
  expect(container.querySelector('a[href="/wiki/transformations/super-saiyan"]')).not.toBeNull();
  await act(async () =>
    [...container!.querySelectorAll("button")]
      .find((button) => button.textContent === "Avec une illustration")!
      .click(),
  );
  expect(container.querySelectorAll("article")).toHaveLength(1);
  expect(container.querySelector("h3")?.textContent).toBe("Forme illustrée");
  await act(async () =>
    [...container!.querySelectorAll("button")]
      .find((button) => button.textContent === "Avec une fiche rédigée")!
      .click(),
  );
  expect(container.querySelector("h3")?.textContent).toBe("Super Saiyan");
});

test("the lineage selector keeps every existing branch reachable without horizontal-only controls", async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<TransformationTreesView />));
  const select = container.querySelector("select")!;
  expect(select.options).toHaveLength(7);
  const initial = container.querySelector("h3")?.textContent;
  await act(async () => {
    select.value = select.options[1]!.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector("h3")?.textContent).not.toBe(initial);
  expect(container.querySelectorAll("ol > li").length).toBeGreaterThan(0);
});

test("mixed events render safely, retain URL filters and switch to a semantic adaptation matrix", async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const battle: Battle = {
    id: 1,
    slug: "test-battle",
    title: "Duel de Goku",
    title_ja: null,
    saga_id: null,
    arc_id: null,
    series: "DB",
    combatants: [{ name: "Goku", role: "challenger", side: "a" }],
    winner_id: null,
    winner_name: "Goku",
    location: "Arène",
    manga_volume_start: 1,
    manga_volume_end: 1,
    manga_chapter_start: 2,
    manga_chapter_end: 3,
    episode_start: 4,
    episode_end: 5,
    techniques_used: ["Kamehameha"],
    climax_summary: "Un duel",
    canon: true,
    impact_level: 1,
    article: null,
    article_sources: null,
  };
  await act(async () =>
    root!.render(
      <NarrativeEventsExplorer
        battles={[battle]}
        tournaments={[
          {
            id: 2,
            slug: "test-tournament",
            name: "Tournoi de la Terre",
            name_ja: null,
            tournament_type: "martial",
            saga: null,
            location: "Arène",
            winner_name: "Goku",
            runner_up_name: "Krilin",
            rules_summary: "Élimination directe",
            participants_count: 8,
            canon: true,
          },
        ]}
        timelineEvents={[
          {
            id: 3,
            age_year: 750,
            era: "DB",
            title: "Une invasion",
            title_ja: null,
            description: "Une bataille",
            characters_involved: ["Goku"],
            source_ref: "Manga",
            canon: true,
          },
        ]}
      />,
    ),
  );
  expect(container.querySelectorAll("article")).toHaveLength(3);
  const tournamentButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Tournois",
  )!;
  await act(async () => tournamentButton.click());
  expect(container.querySelectorAll("article")).toHaveLength(1);
  expect(container.textContent).toContain("Tournoi de la Terre");
  expect(window.location.search).toContain("type=tournaments");
  const view = [...container.querySelectorAll("select")].at(-1)!;
  await act(async () => {
    view.value = "continuity";
    view.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector("table caption")?.textContent).toBe("Matrice des adaptations");
  expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(4);
  expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
});
