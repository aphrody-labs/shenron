// SPDX-License-Identifier: Apache-2.0
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { T } from "@/components/T";
import type { HomeConfig } from "@/lib/home-scenes";
import type { AccessSnapshot } from "@/lib/wiki-launch";
import { DbsBeerusSpotlight } from "./DbsBeerusSpotlight";
import { HomeHero } from "./HomeHero";
import { focusRing } from "./ui";

export interface HomeViewProps {
  config: HomeConfig;
  access: AccessSnapshot | null;
}

const DESTINATIONS = [
  { href: "/wiki/manga", label: "categories.manga.label" },
  { href: "/wiki/databooks", label: "categories.databooks.label" },
  { href: "/wiki/episodes", label: "categories.episodes.label" },
  { href: "/sources/dragon-ball", label: "catalog.categories.sources" },
] as const;

/** A compact entry point: search, reading destinations and the current official spotlight. */
export function HomeView({ config, access }: HomeViewProps) {
  return (
    <>
      <HomeHero hero={config.hero} />
      <PageShell width="wide" rhythm="tight">
        <nav className="py-4 sm:py-5" aria-labelledby="home-library">
          <h2 id="home-library" className="sr-only">
            <T k="library.label" />
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {DESTINATIONS.map(({ href, label }) => (
              <li key={href} className="min-w-0">
                <ClientGatedWrap
                  access={access}
                  href={href}
                  className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/10 bg-dbz-card/60 px-4 py-3 text-sm font-semibold text-os transition-colors hover:border-dbz-gold hover:text-dbz-gold ${focusRing}`}
                >
                  <span className="min-w-0">
                    <T k={label} />
                  </span>
                  <span aria-hidden="true">↗</span>
                </ClientGatedWrap>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mb-5 overflow-hidden rounded-xl border border-white/10">
          <DbsBeerusSpotlight compact />
        </div>
      </PageShell>
    </>
  );
}
