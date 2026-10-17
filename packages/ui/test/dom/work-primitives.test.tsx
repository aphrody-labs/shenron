// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { BroadcastSchedule } from "../../src/public/BroadcastSchedule";
import { Carousel } from "../../src/public/Carousel";
import { CharacterCard } from "../../src/public/CharacterCard";
import { getWorkMessages } from "../../src/public/work-messages";
import en from "../../src/public/locales/work.en.json";
import fr from "../../src/public/locales/work.fr.json";
import ja from "../../src/public/locales/work.ja.json";

afterEach(cleanup);
const messages = getWorkMessages("en");

test("the three dictionaries carry the same keys", () => {
  expect(Object.keys(en).toSorted()).toEqual(Object.keys(fr).toSorted());
  expect(Object.keys(ja).toSorted()).toEqual(Object.keys(fr).toSorted());
  expect(getWorkMessages("xx")).toBe(fr);
});

test("every slide is in the server HTML with its position", () => {
  const html = renderToStaticMarkup(
    <Carousel label="Characters" messages={messages}>
      <p>Goku</p>
      <p>Vegeta</p>
      <p>Piccolo</p>
    </Carousel>,
  );
  expect(html).toContain('aria-label="Characters"');
  expect(html).toContain('aria-roledescription="carousel"');
  for (const name of ["Goku", "Vegeta", "Piccolo"]) expect(html).toContain(name);
  expect(html).toContain('aria-label="3 of 3"');
});

test("arrows are named, bounded and scroll the track", async () => {
  const calls: number[] = [];
  render(
    <Carousel label="Visuals" messages={messages}>
      <p>A</p>
      <p>B</p>
    </Carousel>,
  );
  const previous = screen.getByRole("button", { name: "Previous" });
  const next = screen.getByRole("button", { name: "Next" });
  expect((previous as HTMLButtonElement).disabled).toBe(true);
  expect((next as HTMLButtonElement).disabled).toBe(false);
  const track = document.getElementById(next.getAttribute("aria-controls")!)!;
  Object.defineProperty(track, "clientWidth", { value: 300 });
  Object.defineProperty(track, "scrollWidth", { value: 600 });
  track.scrollBy = ((options: ScrollToOptions) => calls.push(options.left ?? 0)) as never;
  await act(async () => fireEvent.click(next));
  expect(calls).toEqual([300]);
  track.scrollLeft = 300;
  await act(async () => fireEvent.scroll(track));
  expect(screen.getByText("2 of 2").tagName).toBe("OUTPUT");
  expect((next as HTMLButtonElement).disabled).toBe(true);
  expect((previous as HTMLButtonElement).disabled).toBe(false);
});

test("a single slide shows no controls", () => {
  render(
    <Carousel label="One" messages={messages}>
      <p>Only</p>
    </Carousel>,
  );
  expect(screen.queryByRole("button")).toBeNull();
});

test("a character without portrait keeps a decorative sphere and its labels", () => {
  const html = renderToStaticMarkup(
    <CharacterCard
      name="Son Goku"
      nameJa="孫悟空"
      voiceActor="Masako Nozawa"
      blurb="A Saiyan raised on Earth."
      messages={messages}
    />,
  );
  expect(html).toContain("<h3");
  expect(html).toContain('lang="ja"');
  expect(html).toContain("Voice");
  expect(html).not.toContain("<img");
  expect(html).toContain("A Saiyan raised on Earth.");
});

test("a linked character is one link and the portrait is named", () => {
  render(
    <CharacterCard
      name="Vegeta"
      imageSrc="/vegeta.webp"
      href="/wiki/characters/vegeta"
      variant="compact"
      blurb="hidden in compact"
      messages={messages}
    />,
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("img", { name: "Vegeta" })).toBeTruthy();
  expect(screen.queryByText("hidden in compact")).toBeNull();
});

test("broadcast slots print their zone and platforms announce the new tab", () => {
  render(
    <BroadcastSchedule
      messages={messages}
      slots={[
        {
          day: "Sunday",
          time: "23:15",
          timeZone: "Asia/Tokyo",
          channel: "Fuji TV",
          status: "upcoming",
        },
      ]}
      regions={[
        {
          region: "Worldwide",
          platforms: [{ name: "Crunchyroll", url: "https://example.org/cr" }],
        },
        { region: "Europe", platforms: [] },
      ]}
    />,
  );
  expect(screen.getByText("Time zone: Asia/Tokyo")).toBeTruthy();
  expect(screen.getByText("Upcoming")).toBeTruthy();
  const link = screen.getByRole("link", { name: /Crunchyroll/ });
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(link.textContent).toContain("(opens in a new tab)");
  expect(screen.getByText("No platform announced for this region.")).toBeTruthy();
});
