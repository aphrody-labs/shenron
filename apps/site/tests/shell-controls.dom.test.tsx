// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LanguageSwitcher } from "../src/components/LanguageSwitcher";
import { LocaleProvider } from "../src/lib/i18n/client";
import { ShellFooterDetails } from "../src/components/ShellFooterDetails";
import { FooterDestinationLabel } from "../src/components/FooterDestinationLabel";
import { EpisodeThemeSwitcher } from "../src/components/episodes/EpisodeThemeSwitcher";
import { EPISODE_THEME_KEY } from "../src/lib/episode-theme";
import type { Me } from "../src/lib/use-me";

let identity: Me = { authenticated: false, username: null, avatar: null, isAdmin: false };
mock.module("../src/lib/use-me", () => ({ useMe: () => identity }));
mock.module("../src/lib/auth-client", () => ({ authClient: {} }));
const { NavAuth } = await import("../src/components/NavAuth");
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalAct = env.IS_REACT_ACT_ENVIRONMENT;
const originalMedia = typeof window !== "undefined" ? window.matchMedia : undefined;

async function mount(children: React.ReactNode) {
  env.IS_REACT_ACT_ENVIRONMENT = true;
  window.location.href = "https://shell.test/";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<LocaleProvider>{children}</LocaleProvider>));
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  env.IS_REACT_ACT_ENVIRONMENT = originalAct;
  if (typeof document !== "undefined") {
    document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
    delete document.documentElement.dataset.episodeTheme;
    localStorage.removeItem(EPISODE_THEME_KEY);
  }
  if (typeof window !== "undefined" && originalMedia) window.matchMedia = originalMedia;
});

test.skipIf(typeof document === "undefined")(
  "language selection updates footer and returns keyboard focus",
  async () => {
    await mount(
      <>
        <LanguageSwitcher variant="compact" />
        <FooterDestinationLabel href="/privacy" label="Confidentialité" />
      </>,
    );
    const trigger = container!.querySelector("button")!;
    await act(async () => trigger.click());
    const english = [...container!.querySelectorAll("li button")].find((button) =>
      button.textContent?.includes("English"),
    ) as HTMLButtonElement;
    english.focus();
    await act(async () => english.click());
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(container!.textContent).toContain("Privacy");
    expect(document.documentElement.lang).toBe("en");
    expect(document.cookie).toContain("NEXT_LOCALE=en");
    await act(async () => trigger.click());
    container!.querySelector<HTMLButtonElement>("li button")!.focus();
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    expect(document.activeElement).toBe(trigger);
    expect(container!.querySelector("ul")).toBeNull();
  },
);

test.skipIf(typeof document === "undefined")(
  "only authenticated administrators get an admin link",
  async () => {
    await mount(<NavAuth variant="compact" />);
    for (const [authenticated, isAdmin, expected] of [
      [false, false, 0],
      [false, true, 0],
      [true, false, 0],
      [true, true, 1],
    ] as const) {
      identity = { authenticated, isAdmin, username: authenticated ? "Owner" : null, avatar: null };
      await act(async () =>
        root!.render(
          <LocaleProvider>
            <NavAuth variant="compact" />
          </LocaleProvider>,
        ),
      );
      expect(container!.querySelectorAll('a[href="/admin"]').length).toBe(expected);
      expect(container!.querySelectorAll('a[href="/dashboard"]').length).toBe(
        authenticated ? 1 : 0,
      );
    }
  },
);

test.skipIf(typeof document === "undefined")(
  "mounted theme choices follow one shared document preference",
  async () => {
    document.documentElement.dataset.episodeTheme = "beerus";
    await mount(
      <>
        <EpisodeThemeSwitcher compact />
        <EpisodeThemeSwitcher />
      </>,
    );
    const choices = [...container!.querySelectorAll("select")];
    await act(async () => {
      choices[0]!.value = "goku";
      choices[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(choices.map((choice) => choice.value)).toEqual(["goku", "goku"]);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await act(async () => {
      document.documentElement.dataset.episodeTheme = "beerus";
    });
    expect(choices.map((choice) => choice.value)).toEqual(["beerus", "beerus"]);
    delete document.documentElement.dataset.episodeTheme;
  },
);

test.skipIf(typeof document === "undefined")(
  "standalone footer preserves legal destinations when collapsed",
  async () => {
    window.matchMedia = ((query: string) => ({
      matches: query === "(display-mode: standalone)",
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return true;
      },
      addEventListener() {},
      removeEventListener() {},
    })) as typeof window.matchMedia;
    await mount(
      <ShellFooterDetails>
        <div className="page-shell">
          <a href="/privacy">Privacy</a>
        </div>
      </ShellFooterDetails>,
    );
    const details = container!.querySelector("details")!;
    expect(details.dataset.compact).toBe("true");
    expect(details.open).toBe(false);
    expect(details.querySelector('a[href="/privacy"]')).not.toBeNull();
    await act(async () => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    expect(details.open).toBe(true);
    expect(details.querySelector('a[href="/privacy"]')).not.toBeNull();
  },
);
