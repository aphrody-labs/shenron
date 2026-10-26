// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GamesHub } from "../src/components/games/GamesHub";
import fr from "../messages/games-hub/fr.json";
import en from "../messages/games-hub/en.json";
import ja from "../messages/games-hub/ja.json";

function renderHub() {
  return renderToStaticMarkup(<GamesHub />);
}

function articleFor(html: string, href: string) {
  const article = html
    .match(/<article\b[^>]*>[\s\S]*?<\/article>/g)
    ?.find((entry) => entry.includes(`href="${href}"`));
  expect(article).toBeDefined();
  return article!;
}

test("each browser game has its own named destination and discloses account access", () => {
  const html = renderHub();
  const destinations = [
    ["/games/2048", fr.merge.name, false],
    ["/games/tic-tac-toe", fr.morpion.name, true],
    ["/games/rock-paper-scissors", fr.pfc.name, true],
    ["/games/bingo", fr.bingo.name, true],
  ] as const;
  for (const [href, name, account] of destinations) {
    const article = articleFor(html, href);
    expect(article).toContain(`aria-label="${fr.play} — ${name}"`);
    expect(article).toContain(account ? fr.account : fr.noAccount);
    expect(article).not.toContain(account ? fr.noAccount : fr.account);
    expect(article.match(/<a\b/g)).toHaveLength(1);
  }
});

test("explorers have contextual actions instead of game-play promises", () => {
  const html = renderHub();
  for (const [href, action] of [
    ["/games/dragon-pixel", fr.pixel.action],
    ["/games/xenoverse-2", fr.xenoverse.action],
  ]) {
    const article = articleFor(html, href!);
    expect(article).toContain(action!);
    expect(article).not.toMatch(/>Jouer(?:<|\s)/);
    expect(article).not.toContain("15 chapitres");
    expect(article).not.toContain("8 combattants");
  }
  expect(articleFor(html, "/games/xenoverse-2")).toContain("selon sa disponibilité");
});

test("section shortcuts resolve to unique labelled sections", () => {
  const html = renderHub();
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  const anchors = Array.from(html.matchAll(/href="#([^"]+)"/g), (match) => match[1]);
  expect(new Set(anchors)).toEqual(new Set(["browser-games", "explorers", "discord-games"]));
  for (const anchor of anchors) expect(ids).toContain(anchor);
  for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) expect(ids).toContain(match[1]);
  expect(html.match(/<h1\b/g)).toHaveLength(1);
});

test("Discord commands and scoped rewards remain visible alongside faithful rules", () => {
  const html = renderHub();
  expect(articleFor(html, "/games/bingo")).toContain("entre 1 et 100 en dix scans");
  expect(articleFor(html, "/games/tic-tac-toe")).toContain("Contre le bot");
  expect(articleFor(html, "/games/rock-paper-scissors")).toContain("Contre le bot");
  const discord = html.slice(html.indexOf('id="discord-games"'));
  for (const command of ["/pendu", "/morpion", "/pfc", "/bingo"])
    expect(discord).toContain(`<code>${command}</code>`);
  expect(discord).toContain(fr.rewardsDescription);
  expect(discord).toContain(fr.rewardDefaults);
  expect(discord).toContain(fr.join);
  expect(discord).toMatch(/href="https:\/\/discord\.(?:gg|com)\//);
});

function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  expect(typeof value).toBe("object");
  expect(value).not.toBeNull();
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      Object.entries(leaves(child, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}

test("French, English and Japanese cover every message including nested game descriptions", () => {
  const reference = Object.keys(leaves(fr)).toSorted();
  for (const dictionary of [fr, en, ja]) {
    const entries = leaves(dictionary);
    expect(Object.keys(entries).toSorted()).toEqual(reference);
    for (const value of Object.values(entries)) expect(value.trim().length).toBeGreaterThan(0);
  }
});
