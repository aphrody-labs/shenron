// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionNavigation } from "../../src/public/SectionNavigation";

afterEach(cleanup);
const sections = [
  { id: "hero", label: "Home" },
  { id: "canon", label: "Canon" },
];

test("section links exist in server HTML before hydration", () => {
  const html = renderToStaticMarkup(
    <SectionNavigation sections={sections} label="Page sections" />,
  );
  expect(html).toContain('href="#hero"');
  expect(html).toContain('href="#canon"');
  expect(html).toContain('aria-label="Page sections"');
});

test("scrolling updates the current location without replacing native anchors", async () => {
  let canonTop = 1000;
  render(
    <>
      <SectionNavigation sections={sections} label="Page sections" />
      <section id="hero" />
      <section id="canon" />
    </>,
  );
  Object.assign(document.getElementById("hero")!, { getBoundingClientRect: () => ({ top: -100 }) });
  Object.assign(document.getElementById("canon")!, {
    getBoundingClientRect: () => ({ top: canonTop }),
  });
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe(
      "location",
    ),
  );
  canonTop = 100;
  await act(async () => fireEvent.scroll(window));
  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Canon" }).getAttribute("aria-current")).toBe(
      "location",
    ),
  );
  expect(screen.getByRole("link", { name: "Canon" }).getAttribute("href")).toBe("#canon");
  expect(screen.getByRole("link", { name: "Home" }).hasAttribute("aria-current")).toBe(false);
});

test("an edited section order preserves its labels and destinations", () => {
  const view = render(<SectionNavigation sections={sections} label="Page sections" />);
  view.rerender(
    <SectionNavigation
      sections={[{ id: "canon", label: "Edited canon" }, sections[0]!]}
      label="Page sections"
    />,
  );
  expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "Edited canon",
    "Home",
  ]);
  expect(screen.getByRole("link", { name: "Edited canon" }).getAttribute("href")).toBe("#canon");
});
