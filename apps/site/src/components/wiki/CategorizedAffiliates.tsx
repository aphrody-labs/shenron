"use client";

import { useState } from "react";
import { CharacterCardGrid, CharacterPosterCard } from "@/components/wiki/CharacterPosterCard";
import type { AccessSnapshot } from "@/lib/wiki-launch";
import type { CharacterRelationItem } from "@/lib/shenron";

export function CategorizedAffiliates({
  relations,
  characterName,
  access,
}: {
  relations: CharacterRelationItem[];
  characterName: string;
  access?: AccessSnapshot | null;
}) {
  const [activeCategory, setActiveCategory] = useState<"all" | "family" | "friend" | "enemy">(
    "all",
  );

  const familyList = relations.filter((r) => r.category === "family");
  const friendList = relations.filter((r) => r.category === "friend");
  const enemyList = relations.filter((r) => r.category === "enemy");

  const displayedList =
    activeCategory === "all" ? relations : relations.filter((r) => r.category === activeCategory);

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="font-saiyan text-2xl sm:text-4xl text-dbz-cyan uppercase tracking-widest">
            Personnages Affiliés & Relations
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Entourage, famille, alliés de combat et rivaux jurés de {characterName}.
          </p>
        </div>

        {/* Boutons de filtrage par catégorie */}
        <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-white/10 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeCategory === "all"
                ? "bg-dbz-cyan text-black"
                : "text-white/60 hover:text-white hover:bg-white/5"
            }`}
          >
            Tous ({relations.length})
          </button>
          {familyList.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory("family")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeCategory === "family"
                  ? "bg-dbz-orange text-black"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              Famille ({familyList.length})
            </button>
          )}
          {friendList.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory("friend")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeCategory === "friend"
                  ? "bg-emerald-500 text-black"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              Amis & Alliés ({friendList.length})
            </button>
          )}
          {enemyList.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory("enemy")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                activeCategory === "enemy"
                  ? "bg-dbz-red text-white"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              Ennemis ({enemyList.length})
            </button>
          )}
        </div>
      </div>

      {displayedList.length > 0 ? (
        <CharacterCardGrid>
          {displayedList.map((item) => (
            <CharacterPosterCard
              key={item.id}
              href={`/wiki/characters/${item.slug || item.id}`}
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
        <p className="text-sm text-white/50 italic py-6">
          Aucun personnage répertorié dans cette catégorie de relation.
        </p>
      )}
    </section>
  );
}
