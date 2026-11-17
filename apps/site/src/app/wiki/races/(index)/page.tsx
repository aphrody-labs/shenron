// SPDX-License-Identifier: Apache-2.0
import { getShenronRaces, getShenronCharacterCards } from "@/lib/shenron";
import { slugDeRace } from "@aphrody/shenron-config/races-alias";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { WikiImg } from "@/components/wiki/WikiImg";
import { WikiCatalogueText } from "@/components/wiki/WikiCatalogueText";
import { T } from "@/components/T";
import { assetUrl } from "@/lib/assets";
import messages from "../../../../../messages/wiki-catalogue/fr.json";
import styles from "@/components/wiki/wiki-editorial.module.css";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Races Dragon Ball",
  description:
    "Les races de l'univers Dragon Ball : Saiyans, Nameks, Humains, Cyborgs, Démons du Froid et bien plus.",
  alternates: { canonical: "/wiki/races" },
};

export default async function RacesPage() {
  const [races, characters] = await Promise.all([getShenronRaces(), getShenronCharacterCards()]);
  const artwork = characters.find((character) => character.image);
  const byRace = new Map<string, typeof characters>();
  for (const character of characters) {
    const slug = slugDeRace(character.race, character.name);
    if (!slug) continue;
    const members = byRace.get(slug);
    if (members) members.push(character);
    else byRace.set(slug, [character]);
  }
  return (
    <WikiIndexPage
      eyebrow={<T k="wikiExplorer.home" />}
      title={<WikiCatalogueText name="racesTitle" />}
      lead={<WikiCatalogueText name="racesLead" values={{ count: races.length }} />}
      image={artwork?.image ?? undefined}
      imageAlt={artwork?.name}
      crumbs={[{ label: messages.racesTitle, display: <WikiCatalogueText name="racesTitle" /> }]}
      category="races"
      contributeKey="kit.contribute.what.race"
    >
      <div className={styles.topicGrid}>
        {races.map((race) => {
          const members = byRace.get(race.slug) ?? [];
          const portraits = members.filter((member) => member.image).slice(0, 4);
          return (
            <Link
              key={race.id}
              href={"/wiki/races/" + race.slug}
              className={styles.topicCard}
              style={{ "--wiki-accent": "var(--wiki-namek)" } as React.CSSProperties}
            >
              <article className={styles.discoveryArticle}>
                {portraits[0] && (
                  <div className={styles.topicMedia}>
                    <WikiImg
                      src={assetUrl(portraits[0].image)}
                      alt={portraits[0].name}
                      className={styles.raceImage}
                      sizes="(min-width:1024px) 420px, (min-width:640px) 50vw, 100vw"
                    />
                  </div>
                )}
                <div className={styles.topicContent}>
                  <h2 className={styles.topicHeading}>
                    {race.name}
                    <ArrowUpRight aria-hidden="true" size={18} />
                  </h2>
                  {race.nameJa && (
                    <p className={styles.discoverySubtitle} lang="ja">
                      {race.nameJa}
                    </p>
                  )}
                  <p className={styles.discoveryMeta}>
                    <WikiCatalogueText name="memberCount" values={{ count: members.length }} />
                  </p>
                  {race.description && (
                    <p className={styles.discoveryDescription}>{race.description}</p>
                  )}
                  <div className={styles.raceMembers}>
                    {portraits.map((member) => (
                      <span key={member.id} className={styles.raceAvatar} title={member.name}>
                        <WikiImg
                          src={assetUrl(member.image)}
                          alt={member.name}
                          className={styles.raceImage}
                          sizes="32px"
                        />
                      </span>
                    ))}
                    <WikiCatalogueText name={members.length ? "members" : "noMembers"} />
                  </div>
                </div>
              </article>
            </Link>
          );
        })}
      </div>
    </WikiIndexPage>
  );
}
