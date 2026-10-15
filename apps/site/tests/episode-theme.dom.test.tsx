// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { EpisodeThemeSwitcher } from "../src/components/episodes/EpisodeThemeSwitcher";
import {
  EPISODE_THEME_KEY,
  EPISODE_THEME_BOOT,
  resolveEpisodeTheme,
} from "../src/lib/episode-theme";
import fr from "../messages/fr.json";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const original = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  if (typeof document !== "undefined") {
    delete document.documentElement.dataset.episodeTheme;
    localStorage.removeItem(EPISODE_THEME_KEY);
  }
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = original;
});

test("neutral is the default and episode palettes require an explicit selection", () => {
  expect(resolveEpisodeTheme("goku")).toBe("goku");
  expect(resolveEpisodeTheme("beerus")).toBe("beerus");
  for (const value of [null, undefined, "legacy", "<script>"])
    expect(resolveEpisodeTheme(value)).toBe("neutral");
});

test.skipIf(typeof document === "undefined")(
  "a fresh visit restores the neutral site theme before hydration",
  () => {
    localStorage.removeItem(EPISODE_THEME_KEY);
    new Function(EPISODE_THEME_BOOT)();
    expect(document.documentElement.dataset.episodeTheme).toBe("neutral");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  },
);

test.skipIf(typeof document === "undefined")(
  "the saved light palette is applied before hydration",
  () => {
    localStorage.setItem(EPISODE_THEME_KEY, "goku");
    new Function(EPISODE_THEME_BOOT)();
    expect(document.documentElement.dataset.episodeTheme).toBe("goku");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  },
);

test.skipIf(typeof document === "undefined")(
  "theme selection updates color mode and survives a reload",
  async () => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    document.documentElement.dataset.episodeTheme = "beerus";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <NextIntlClientProvider locale="fr" messages={fr}>
          <EpisodeThemeSwitcher />
        </NextIntlClientProvider>,
      ),
    );
    const select = container.querySelector("select")!;
    expect(select.labels?.[0]?.textContent).toContain("Choisir le thème");
    await act(async () => {
      select.value = "goku";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.documentElement.dataset.episodeTheme).toBe("goku");
    expect(localStorage.getItem(EPISODE_THEME_KEY)).toBe("goku");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await act(async () => {
      select.value = "beerus";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  },
);
