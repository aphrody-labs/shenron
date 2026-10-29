import { readFileSync, writeFileSync } from "fs";

const path = "apps/site/src/app/wiki/characters/[slug]/page.tsx";
let code = readFileSync(path, "utf8");

// 1. Add import for CategorizedAffiliates and getShenronCharacterRelations
code = code.replace(
  'import { WikiRelatedCharacters } from "@/components/wiki/WikiRelatedCharacters";',
  'import { WikiRelatedCharacters } from "@/components/wiki/WikiRelatedCharacters";\nimport { CategorizedAffiliates } from "@/components/wiki/CategorizedAffiliates";\nimport { getShenronCharacterRelations } from "@/lib/shenron";',
);

// 2. Fetch relations alongside variants
code = code.replace(
  `  const [variants, access] = await Promise.all([
    getShenronCharacterVariants(character.id),
    getLaunchConfig().catch(() => null),
  ]);`,
  `  const [variants, relations, access] = await Promise.all([
    getShenronCharacterVariants(character.id),
    getShenronCharacterRelations(character.id),
    getLaunchConfig().catch(() => null),
  ]);`,
);

// 3. Replace the affiliate panel with CategorizedAffiliates
const oldAffiliatesPanel = `  if (character.affiliates.length > 0) {
    panels.push({
      key: "affilies",
      label: "Personnages affiliés",
      accent: "cyan",
      node: (
        <WikiRelatedCharacters
          heading="Personnages affiliés"
          caption={
            character.affiliation
              ? \`Autres personnages liés à « \${character.affiliation} ».\`
              : undefined
          }
          items={character.affiliates}
        />
      ),
    });
  }`;

const newAffiliatesPanel = `  if (relations.length > 0 || character.affiliates.length > 0) {
    panels.push({
      key: "affilies",
      label: "Affiliés & Relations",
      accent: "cyan",
      node: relations.length > 0 ? (
        <CategorizedAffiliates
          relations={relations}
          characterName={character.name}
          access={access}
        />
      ) : (
        <WikiRelatedCharacters
          heading="Personnages affiliés"
          caption={
            character.affiliation
              ? \`Autres personnages liés à « \${character.affiliation} ».\`
              : undefined
          }
          items={character.affiliates}
        />
      ),
    });
  }`;

code = code.replace(oldAffiliatesPanel, newAffiliatesPanel);

// 4. Update the Infobox to include Version Selectors under the portrait and clean up voice actors
const oldInfoboxHeader = `                {/* Portrait principal */}
                <div className="p-4 bg-[#0a0a0c] border-b-2 border-black flex justify-center items-center relative overflow-hidden group">
                  <div className="absolute inset-0 halftone opacity-10" />
                  <ViewTransition name={\`character-img-\${character.id}\`} share="morph">
                    {/* Meilleure résolution existante en premier (image éditoriale,
								    portrait XV2 ou copie plus grande de la même image, mesurées
								    par l'inventaire) ; l'autre reste en repli. */}
                    <WikiImg
                      src={heroImage}
                      fallback={
                        heroImage === character.image ? character.portraitXv2 : character.image
                      }
                      alt={character.name}
                      loading="eager"
                      className="max-h-[380px] w-auto object-contain relative z-10 drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] group-hover:scale-105 transition-transform duration-500"
                      placeholderClassName="relative z-10 w-full aspect-[3/4] flex items-center justify-center bg-dbz-card overflow-hidden rounded"
                    />
                  </ViewTransition>
                </div>`;

const newInfoboxHeader = `                {/* Portrait principal */}
                <div className="p-4 bg-[#0a0a0c] border-b-2 border-black flex justify-center items-center relative overflow-hidden group">
                  <div className="absolute inset-0 halftone opacity-10" />
                  <ViewTransition name={\`character-img-\${character.id}\`} share="morph">
                    <WikiImg
                      src={heroImage}
                      fallback={
                        heroImage === character.image ? character.portraitXv2 : character.image
                      }
                      alt={character.name}
                      loading="eager"
                      className="max-h-[380px] w-auto object-contain relative z-10 drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] group-hover:scale-105 transition-transform duration-500"
                      placeholderClassName="relative z-10 w-full aspect-[3/4] flex items-center justify-center bg-dbz-card overflow-hidden rounded"
                    />
                  </ViewTransition>
                </div>

                {/* Sélecteurs déroulants de Versions et Sagas propres */}
                {(character.versions.length > 0 || variants.length > 0) && (
                  <div className="p-3.5 bg-black/60 border-b border-white/10 space-y-3">
                    {character.versions.length > 0 && (
                      <div className="space-y-1.5">
                        <label htmlFor="select-version" className="block text-[10px] font-bold uppercase tracking-wider text-dbz-orange">
                          Versions Alternatives //
                        </label>
                        <select
                          id="select-version"
                          aria-label="Sélectionner une version alternative du personnage"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              window.location.href = e.target.value;
                            }
                          }}
                          className="w-full bg-[#141416] border border-dbz-orange/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-dbz-orange transition-colors cursor-pointer"
                        >
                          <option value="">{character.name} (Actuelle)</option>
                          {character.versions.map((ver) => (
                            <option key={ver.id} value={\`/wiki/characters/\${ver.slug || ver.id}\`}>
                              {ver.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {variants.length > 0 && (
                      <div className="space-y-1.5">
                        <label htmlFor="select-saga" className="block text-[10px] font-bold uppercase tracking-wider text-dbz-cyan">
                          Évolution Saga / Timeline //
                        </label>
                        <select
                          id="select-saga"
                          aria-label="Sélectionner une saga ou timeline pour afficher sa fiche"
                          defaultValue="overview"
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "overview") {
                              const btn = document.getElementById("character-version-tab-overview");
                              if (btn) btn.click();
                            } else {
                              const btn = document.getElementById(\`character-version-tab-\${val}\`);
                              if (btn) btn.click();
                            }
                          }}
                          className="w-full bg-[#141416] border border-dbz-cyan/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-dbz-cyan transition-colors cursor-pointer"
                        >
                          <option value="overview">★ Fiche complète (Toutes sagas)</option>
                          {variants.map((v) => (
                            <option key={v.id} value={v.slug}>
                              {v.label} {v.form ? \`— \${v.form}\` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}`;

code = code.replace(oldInfoboxHeader, newInfoboxHeader);

// 5. Replace voiceActors in infobox with clean expandable/superfluous field
const oldVaSection = `                  {character.voiceActors?.map((va) => (
                    <div key={va.id} className="wiki-infobox-row">
                      <span className="wiki-infobox-label">
                        {va.nationality === "ja"
                          ? "Seiyū (Japonais)"
                          : va.nationality === "fr"
                            ? "Voix Française"
                            : \`Voix (\${va.nationality.toUpperCase()})\`}
                      </span>
                      <span className="wiki-infobox-value text-dbz-orange">
                        <GatedWrap href="/wiki/staff?tier=voice" className="hover:underline">
                          {va.name}{" "}
                          {va.nameJa && (
                            <span lang="ja" className="font-jp text-xs opacity-75">
                              ({va.nameJa})
                            </span>
                          )}
                        </GatedWrap>
                        {va.roleNotes && (
                          <span className="block text-[10px] text-white/40 font-normal mt-0.5">
                            {va.roleNotes}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}`;

const newVaSection = `                  {character.voiceActors && character.voiceActors.length > 0 && (
                    <div className="p-3 bg-black/20">
                      <details className="group">
                        <summary className="flex items-center justify-between text-[11px] font-bold text-white/70 uppercase tracking-wider cursor-pointer hover:text-dbz-orange transition-colors">
                          <span>Comédiens de doublage ({character.voiceActors.length})</span>
                          <span className="text-xs group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <div className="mt-3 space-y-2.5 pt-2 border-t border-white/5">
                          {character.voiceActors.map((va) => (
                            <div key={va.id} className="text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold text-dbz-orange">
                                  {va.nationality === "ja"
                                    ? "Japonais (Seiyū)"
                                    : va.nationality === "fr"
                                      ? "Français"
                                      : va.nationality.toUpperCase()}
                                </span>
                                <GatedWrap href="/wiki/staff?tier=voice" className="text-white hover:underline font-semibold">
                                  {va.name}
                                </GatedWrap>
                              </div>
                              {va.roleNotes && (
                                <p className="text-[10px] text-white/40 mt-0.5">
                                  {va.roleNotes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}`;

code = code.replace(oldVaSection, newVaSection);

writeFileSync(path, code, "utf8");
console.log("Updated character detail page successfully!");
