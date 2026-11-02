import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import fr from "../messages/fr.json";
import { DEFAULT_HOME_CONFIG, SECTION_SCENE } from "@aphrody/shenron-config/home";
import { HomeHero } from "../src/components/home/HomeHero";
import { SectionScene } from "../src/components/home/SectionScene";
import { HomeScreenDeck } from "../src/components/home/HomeScreenDeck";
import { HomeSection } from "../src/components/home/HomeSection";
import {
  primaryButton,
  secondaryButton,
  surfaceLink,
  tactilePress,
} from "../src/components/home/ui";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = env.IS_REACT_ACT_ENVIRONMENT;
const originalMatchMedia = typeof window !== "undefined" ? window.matchMedia : undefined;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  env.IS_REACT_ACT_ENVIRONMENT = previousAct;
  if (typeof window !== "undefined" && originalMatchMedia) {
    window.matchMedia = originalMatchMedia;
  }
});

describe("home redesign UI/UX — hero, immersive sections & click feedback", () => {
  test("rearranged hero groups brand masthead separately from the Beerus feature stage", () => {
    const episodes = [
      { id: 875, number: 1, title: "Le dieu de la Destruction" },
      { id: 876, number: 2, title: "Le dieu de la Destruction se rend sur la planète de Kaïo" },
      { id: 877, number: 3, title: "Le dieu de la Destruction se dirige vers la Terre" },
    ];
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
        <HomeHero
          hero={{ ...DEFAULT_HOME_CONFIG.hero, lede: "Tout l’univers Dragon Ball en français." }}
          beerus={{ total: 3, latest: episodes[2]!, episodes }}
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('src="/brand/dragonballfr-logo.svg"');
    expect(html).toContain("Tout l’univers Dragon Ball en français.");
    expect(html).toContain('src="/official/beerus/logo-en.webp"');
    expect(html).toContain('href="/wiki/episodes/877"');
    expect(html).toContain('href="/wiki/episodes/875"');
    expect(html).toContain('href="/wiki/episodes/876"');
  });

  test("SectionScene projects era atmosphere and accent token without mounting video", () => {
    const html = renderToStaticMarkup(
      <SectionScene scene={SECTION_SCENE.guardians}>
        <HomeSection id="guardians" title="Les gardiens" moreHref="/wiki" moreLabel="Voir tout">
          <p>Six divinités</p>
        </HomeSection>
      </SectionScene>,
    );

    expect(html).toContain('data-scene-era="divine"');
    expect(html).toContain('data-scene-id="beerus-guardians"');
    expect(html).toContain(`--scene-accent:${SECTION_SCENE.guardians.accent}`);
    expect(html).toContain('class="home-section-backdrop"');
    expect(html).not.toContain("<video");
  });

  test("shared UI tokens include tactile click press classes and reduced-motion guards", () => {
    expect(tactilePress).toContain("cursor-pointer");
    expect(tactilePress).toContain("active:scale-[0.98]");
    expect(tactilePress).toContain("motion-reduce:active:scale-100");
    expect(surfaceLink).toContain("hover:border-dbz-gold");
    expect(primaryButton).toContain("active:scale-[0.96]");
    expect(secondaryButton).toContain("active:scale-[0.96]");
  });

  test.skipIf(typeof document === "undefined")(
    "clicking an interactive element inside HomeScreenDeck spawns a Ki click ripple when motion is active",
    async () => {
      env.IS_REACT_ACT_ENVIRONMENT = true;
      window.matchMedia = () =>
        ({
          matches: false,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList;

      host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);

      await act(async () => {
        root!.render(
          <NextIntlClientProvider locale="fr" messages={fr} timeZone="UTC">
            <HomeScreenDeck>
              <div>
                <a href="/wiki/episodes/877" id="cta-test">
                  Voir l’épisode
                </a>
              </div>
            </HomeScreenDeck>
          </NextIntlClientProvider>,
        );
      });

      expect(host.querySelector(".home-click-fx")).toBeNull();

      const link = host.querySelector("#cta-test")!;
      await act(async () => {
        link.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            button: 0,
            clientX: 240,
            clientY: 180,
          }),
        );
      });

      const ripple = host.querySelector(".home-click-fx") as HTMLElement | null;
      expect(ripple).not.toBeNull();
      expect(ripple?.hasAttribute("data-strong")).toBe(true);
      expect(ripple?.style.getPropertyValue("--click-x")).toBe("240px");
      expect(ripple?.style.getPropertyValue("--click-y")).toBe("180px");
    },
  );
});
