import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "../src/layout/PageHeader";
import { EmptyState } from "../src/public/EmptyState";
import { SectionDivider } from "../src/vie/SectionDivider";
import { VIE_ART_KINDS, VieArt } from "../src/vie/VieArt";

test("every scene is decorative: aria-hidden, no role, no text", () => {
  for (const kind of VIE_ART_KINDS) {
    const html = renderToStaticMarkup(<VieArt kind={kind} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(`data-vie-art="${kind}"`);
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain("<title");
    expect(html).toContain("<svg");
  }
});

test("the seven spheres carry 1 to 7 stars and stay light", () => {
  const html = renderToStaticMarkup(<VieArt kind="spheres" />);
  expect(html.match(/<svg/g)?.length).toBe(7);
  expect(html.length).toBeLessThan(40_000);
});

test("PageHeader adds art and speed lines only on request", () => {
  const plain = renderToStaticMarkup(<PageHeader title="T" />);
  const art = renderToStaticMarkup(<PageHeader title="T" art="kinto" />);
  expect(plain).not.toContain("vie-speed");
  expect(art).toContain("vie-speed");
  expect(art).toContain('data-vie-art="kinto"');
});

test("EmptyState keeps its exits and gains an illustration", () => {
  const html = renderToStaticMarkup(
    <EmptyState title="Vide" illustration="senzu" actions={[{ href: "/wiki", label: "Wiki" }]} />,
  );
  expect(html).toContain('data-vie-art="senzu"');
  expect(html).toContain('href="/wiki"');
  expect(renderToStaticMarkup(<EmptyState title="Vide" />)).not.toContain("data-vie-art");
});

test("SectionDivider is hidden from assistive tech", () => {
  expect(renderToStaticMarkup(<SectionDivider />)).toContain('aria-hidden="true"');
});

test("vie.css only animates transform-like properties and honours reduced motion", () => {
  const css = readFileSync(new URL("../src/vie.css", import.meta.url), "utf8");
  expect(css).toContain("prefers-reduced-motion: reduce");
  expect(css).not.toMatch(/animation[^;]*(width|height|top|left|margin)/);
  expect(css).toContain('[data-vie-live="true"]');
});
