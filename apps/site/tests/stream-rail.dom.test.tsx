// SPDX-License-Identifier: Apache-2.0
import "./dom-preload";
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { StreamRail } from "../src/components/stream/StreamRail";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
const previousMatchMedia = typeof window !== "undefined" ? window.matchMedia : undefined;

test("adding saved cards recalculates overflow without resizing the viewport", async () => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const renderCards = (count: number) =>
    root!.render(
      <StreamRail controls="always" nextLabel="Next">
        {Array.from({ length: count }, (_, index) => (
          <a key={index} href={`/wiki/episodes/${index + 1}`}>
            Episode {index + 1}
          </a>
        ))}
      </StreamRail>,
    );
  await act(async () => renderCards(1));
  const rail = container.querySelector("ul")!;
  Object.defineProperties(rail, {
    clientWidth: { get: () => 400 },
    scrollWidth: { get: () => rail.children.length * 300 },
  });
  await act(async () => rail.dispatchEvent(new Event("scroll")));
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.disabled).toBe(true);
  await act(async () => renderCards(5));
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.disabled).toBe(false);
  await act(async () => renderCards(1));
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.disabled).toBe(true);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  if (typeof window !== "undefined") window.matchMedia = previousMatchMedia!;
  environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
});

test("legacy rails retain default hover controls while optional labels and list styling compose", () => {
  const original = renderToStaticMarkup(
    <StreamRail ariaLabel="Episodes">
      <a href="/wiki/episodes/1">One</a>
    </StreamRail>,
  );
  expect(original).toContain('aria-label="Défiler vers la droite"');
  expect(original).toContain("group-hover/rail:pointer-events-auto");
  expect(original.match(/<li\b/g)?.length).toBe(1);
  const adapted = renderToStaticMarkup(
    <StreamRail
      ariaLabel="Episodes"
      controls="always"
      previousLabel="Previous episodes"
      nextLabel="Next episodes"
      listClassName="catalogue-list"
    >
      <a href="/wiki/episodes/1">One</a>
    </StreamRail>,
  );
  expect(adapted).toContain('aria-label="Previous episodes"');
  expect(adapted).toContain('aria-label="Next episodes"');
  expect(adapted).toContain("catalogue-list");
  expect(adapted).toContain("size-11");
  expect(adapted).not.toContain("group-hover/rail:pointer-events-auto");
});

test.skipIf(typeof document === "undefined")(
  "always-visible controls use the shared scroll bounds and reduced-motion behavior",
  async () => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    let reduce = false;
    window.matchMedia = ((query: string) => ({
      matches: reduce,
      media: query,
    })) as typeof window.matchMedia;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <StreamRail controls="always" previousLabel="Previous" nextLabel="Next">
          <a href="/wiki/episodes/1">One</a>
          <a href="/wiki/episodes/2">Two</a>
        </StreamRail>,
      ),
    );
    const rail = container.querySelector("ul")!;
    const left = container.querySelector<HTMLButtonElement>('[aria-label="Previous"]')!;
    const right = container.querySelector<HTMLButtonElement>('[aria-label="Next"]')!;
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1200 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    const movements: ScrollToOptions[] = [];
    rail.scrollBy = ((options: ScrollToOptions) => {
      movements.push(options);
      rail.scrollLeft += options.left ?? 0;
      rail.dispatchEvent(new Event("scroll"));
    }) as typeof rail.scrollBy;
    await act(async () => rail.dispatchEvent(new Event("scroll")));
    expect(left.disabled).toBe(true);
    expect(right.disabled).toBe(false);
    await act(async () => right.click());
    expect(movements[0]).toEqual({ left: 340, behavior: "smooth" });
    expect(left.disabled).toBe(false);
    reduce = true;
    await act(async () => left.click());
    expect(movements[1]).toEqual({ left: -340, behavior: "auto" });
    expect(left.disabled).toBe(true);
    await act(async () => {
      rail.scrollLeft = 800;
      rail.dispatchEvent(new Event("scroll"));
    });
    expect(right.disabled).toBe(true);
    expect(left.disabled).toBe(false);
  },
);
