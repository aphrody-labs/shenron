// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  DEFAULT_GAME_ORIGINS,
  resolveGameUrl,
  resolveGameApiUrl,
  resolveSiteSurface,
} from "../src/game";

test("game origins are centralized, configurable and never include credentials or paths", () => {
  expect(resolveGameUrl({})).toBe(DEFAULT_GAME_ORIGINS.play);
  expect(resolveGameApiUrl({})).toBe(DEFAULT_GAME_ORIGINS.api);
  expect(resolveGameUrl({ NEXT_PUBLIC_GAME_URL: "http://localhost:5013/" })).toBe(
    "http://localhost:5013",
  );
  expect(resolveGameApiUrl({ SHENRON_PUBLIC_GAME_API_URL: "https://game.example/" })).toBe(
    "https://game.example",
  );
  for (const value of [
    "javascript:alert(1)",
    "https://user:secret@game.example/",
    "https://game.example/admin",
    "https://game.example/?token=x",
  ])
    expect(() => resolveGameUrl({ NEXT_PUBLIC_GAME_URL: value })).toThrow();
});

test("game surface is an explicit independent server process profile", () => {
  expect(resolveSiteSurface({})).toBe("site");
  expect(resolveSiteSurface({ SHENRON_SITE_SURFACE: "game" })).toBe("game");
  expect(() => resolveSiteSurface({ SHENRON_SITE_SURFACE: "unknown" })).toThrow();
});
