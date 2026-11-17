"use client";

import { CharacterCardGrid, CharacterPosterCard } from "@/components/wiki/CharacterPosterCard";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import type { CharacterRelationItem } from "@/lib/shenron";
import type { ReactNode } from "react";

export function CategorizedAffiliates({
  relations,
  characterName,
  access,
  labels,
  familyContent,
}: {
  relations: CharacterRelationItem[];
  characterName: string;
  access?: AccessSnapshot | null;
  labels: {
    title: string;
    intro: string;
    family: string;
    friends: string;
    enemies: string;
    empty: string;
  };
  familyContent?: ReactNode;
}) {
  const groups = [
    { key: "family", title: labels.family },
    { key: "friend", title: labels.friends },
    { key: "enemy", title: labels.enemies },
  ] as const;

  return (
    <section className="space-y-6">
      <header className="border-b border-white/10 pb-4">
        <h2 className="font-saiyan text-2xl sm:text-4xl text-dbz-cyan uppercase tracking-widest">
          {labels.title.replace("{name}", characterName)}
        </h2>
        <p className="mt-1 text-xs text-white/50">{labels.intro}</p>
      </header>
      {groups.map(({ key, title }) => {
        const items = relations.filter((relation) => relation.category === key);
        return (
          <section key={key} className="space-y-4">
            {key === "family" && familyContent ? (
              familyContent
            ) : (
              <h3 className="font-display text-lg font-bold text-white">{title}</h3>
            )}
            {items.length > 0 ? (
              <CharacterCardGrid>
                {items.map((item) => (
                  <CharacterPosterCard
                    key={item.id}
                    href={`/wiki/characters/${item.slug || item.relatedCharacterId || item.id}`}
                    name={item.name}
                    subtitle={
                      <span className="flex flex-col">
                        {item.relationType && (
                          <span className="text-dbz-orange font-semibold text-[11px]">
                            {item.relationType}
                          </span>
                        )}
                        {item.nameJa && (
                          <span lang="ja" className="font-jp text-[10px] text-white/40">
                            {item.nameJa}
                          </span>
                        )}
                      </span>
                    }
                    image={item.image}
                    width="full"
                    access={access}
                  />
                ))}
              </CharacterCardGrid>
            ) : (
              <p className="text-sm italic text-white/45">{labels.empty}</p>
            )}
          </section>
        );
      })}
    </section>
  );
}
