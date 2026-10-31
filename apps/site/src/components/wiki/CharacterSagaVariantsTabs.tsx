"use client";

/**
 * Frise des **versions d'un personnage saga par saga** — « Goku, saga Namek »,
 * « Goku, saga Majin Boo ».
 *
 * Client, mais sans aucun chargement : la liste complète arrive en props depuis
 * le RSC, donc tout est déjà dans le HTML rendu au serveur (indexable). Le
 * client ne sert qu'à changer de saga sans recharger la page.
 *
 * Ce que la fiche ne doit PAS faire croire : une variante amorcée
 * automatiquement (`origin = "ocr-manga"`) dit seulement que le nom du
 * personnage a été relevé sur N planches des tomes X à Y. Ce n'est pas la même
 * chose que « il combat dans cette saga » — un personnage mort peut être cité
 * pendant trois tomes. Le bandeau de provenance le dit mot pour mot plutôt que
 * de laisser la frise se faire passer pour une biographie vérifiée.
 */
import type { ReactNode } from "react";
import { WikiImg } from "@/components/wiki/WikiImg";
// `ClientGatedWrap` et NON `GatedWrap` : ce dernier lit la configuration de
// lancement côté serveur, donc tire `postgres` — dans un composant client, cela
// fait échouer le rendu (`Module not found: dns/net/tls`). L'instantané d'accès
// est résolu par la page et descend en props.
import { ClientGatedWrap } from "@/components/GatedClientLink";
import type { AccessSnapshot } from "@/lib/wiki-launch";
import type { CharacterVariant } from "@/lib/shenron";
import type { CharacterSagaMessages } from "@/lib/wiki-character-version-messages";
import { verifiedCharacterVariantImage } from "@/lib/wiki-image-evidence";

const WIKI_ARTWORK_HOSTS = new Set([
  "cdn.dragonballfr.com",
  "dragon-ball-official.com",
  "www.dragon-ball-official.com",
  "en.dragon-ball-official.com",
  "fr.dragon-ball-official.com",
  "jp.dragon-ball-official.com",
  "shonenjump.com",
  "www.shonenjump.com",
  "shueisha.co.jp",
  "www.shueisha.co.jp",
  "vjump.shueisha.co.jp",
  "toei-anim.co.jp",
  "www.toei-anim.co.jp",
  "lineup.toei-anim.co.jp",
  "toei-animation.com",
  "www.toei-animation.com",
]);

function safePrimaryUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.href !== value ||
      !WIKI_ARTWORK_HOSTS.has(url.hostname) ||
      /(?:^|\.)fandom\.com$/i.test(url.hostname)
    )
      return null;
    for (const key of url.searchParams.keys())
      if (/token|secret|auth|password|signature|credential|api.?key/i.test(key)) return null;
    if (
      url.hostname === "cdn.dragonballfr.com" &&
      !/^\/assets\/(?:manga|dbz\/officiel-|wiki\/episodes\/|wiki\/variants\/)/.test(url.pathname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function Champ({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="dbz-panel border-l-4 border-l-dbz-blue-light p-4">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">{titre}</p>
      <p className="scouter-text text-xl text-dbz-blue-light">{valeur}</p>
    </div>
  );
}

export function CharacterSagaVariantsTabs({
  variants,
  overviewNode,
  characterName,
  access,
  summaryNodes,
  powerScalingNodes,
  transformationNodes,
  techniqueNodes,
  messages,
  activeVariantIndex,
  showPortrait = true,
}: {
  variants: Omit<CharacterVariant, "summary">[];
  overviewNode: ReactNode;
  summaryNodes: ReactNode[];
  powerScalingNodes: ReactNode[];
  characterName: string;
  /** Instantané de la configuration de lancement, résolu côté serveur. */
  access?: AccessSnapshot | null;
  transformationNodes: ReactNode[];
  techniqueNodes: ReactNode[];
  messages: CharacterSagaMessages;
  activeVariantIndex: number;
  showPortrait?: boolean;
}) {
  const actif = activeVariantIndex;
  // The page-level selector controls saga state in the URL so the hero, article,
  // affiliations, relationships, powers and transformations share one selection.
  if (!variants.length) return null;
  const isOverview = actif < 0;
  const variantIndex = Math.max(actif, 0);
  const v = variants[Math.min(variantIndex, variants.length - 1)]!;
  // The wiki accepts only source-verifiable manga/anime artwork. Older
  // editorial records may still identify an image as generated; never render
  // that asset or its generation prompt/reference as a public source image.
  // This legacy marker is intentionally excluded from the persisted evidence
  // type; read it only to suppress old records during their cleanup.
  const legacyArtwork = v.evidence as unknown as
    | { imageArtwork?: { kind?: unknown } }
    | null
    | undefined;
  const generatedArtwork = legacyArtwork?.imageArtwork?.kind === "generated";
  const imageReferences = (generatedArtwork ? [] : (v.evidence?.editorialReferences ?? [])).flatMap(
    (reference) => {
      if (!reference.fields.includes("image")) return [];
      const url = safePrimaryUrl(reference.url);
      return url ? [{ ...reference, url }] : [];
    },
  );
  // Fail closed: an image needs both an approved source URL and an explicit
  // editorial reference that attests to the image field.
  const displayImage = verifiedCharacterVariantImage(v.image, v.evidence);
  const tomes =
    v.firstVolume != null && v.lastVolume != null
      ? v.firstVolume === v.lastVolume
        ? messages.volumeSingle.replace("{number}", String(v.firstVolume))
        : messages.volumesRange.replace("{range}", `${v.firstVolume}–${v.lastVolume}`)
      : null;
  const episodes =
    v.firstEpisode != null && v.lastEpisode != null
      ? // La série est indispensable : les épisodes 1 à 20 de Daima n'ont rien
        // à voir avec les épisodes 1 à 20 de Z.
        `${v.episodeSeries ?? ""} ${
          v.firstEpisode === v.lastEpisode
            ? messages.episodeSingle.replace("{number}", String(v.firstEpisode))
            : messages.episodesRange.replace("{range}", `${v.firstEpisode}–${v.lastEpisode}`)
        }`.trim()
      : null;
  const mesuree = v.origin != null && v.origin !== "editorial";

  return (
    <section className="space-y-8">
      {showPortrait && (
        <p className="max-w-3xl text-sm leading-relaxed text-white/70">
          {messages.intro.replace("{count}", String(variants.length))}
        </p>
      )}

      <section
        aria-live="polite"
        aria-label={isOverview ? messages.overview : `${characterName} — ${v.label}`}
      >
        {isOverview ? (
          overviewNode
        ) : (
          <div className="dbz-panel flex flex-col gap-6 p-6 sm:flex-row">
            {showPortrait && (
              <div className="w-full shrink-0 sm:w-56">
                {/* `aspect-[3/4]` obligatoire : passer `sizes` à WikiImg bascule le
					    rendu sur next/image en mode `fill`, qui se positionne en absolu
					    et ne donne AUCUNE hauteur à son parent. Sans ratio ici, la
					    colonne s'effondrait à une bande de vingt pixels. */}
                <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-dbz-border bg-dbz-bg">
                  <div aria-hidden className="halftone absolute inset-0 z-10 opacity-10" />
                  {displayImage ? (
                    <WikiImg
                      src={displayImage}
                      alt={v.displayName ?? `${characterName} — ${v.label}`}
                      sizes="(min-width: 640px) 224px, 100vw"
                      loading="lazy"
                      className="object-contain p-2"
                      placeholderClassName="absolute inset-0 flex items-center justify-center rounded"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent p-5 text-center">
                      <span aria-hidden="true" className="font-saiyan text-5xl text-white/25">
                        ?
                      </span>
                      <span className="text-xs leading-relaxed text-white/60">
                        {messages.noImage}
                      </span>
                    </div>
                  )}
                </div>
                {imageReferences.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs leading-relaxed text-white/60">
                    <p className="font-semibold text-white/75">{messages.imageReference}</p>
                    <ul className="space-y-1">
                      {imageReferences.map((reference) => (
                        <li key={`${reference.url}:${reference.locator}`}>
                          <a
                            href={reference.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`${messages.imageReference}: ${reference.title}, ${reference.locator}`}
                            className="font-semibold text-dbz-orange underline underline-offset-2 hover:text-white"
                          >
                            {reference.title}{" "}
                            <span className="font-normal">· {reference.locator}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-4">
              <div>
                {/* `h2` et non `h3` : cette frise est une rubrique de la fiche au
						    même titre que « Transformations » ou « Personnages affiliés »,
						    qui titrent toutes en `h2`. Elle sautait donc un niveau sous le
						    `h1` du personnage, et la fiche n'avait aucun `h2` quand la
						    frise était sa seule rubrique. */}
                <h2 className="font-saiyan text-2xl uppercase tracking-widest text-white sm:text-3xl">
                  {showPortrait ? (v.displayName ?? `${characterName} — ${v.label}`) : v.sagaName}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <ClientGatedWrap
                    access={access}
                    href={`/wiki/sagas/${v.sagaSlug}`}
                    className="font-bold uppercase tracking-widest text-dbz-orange hover:text-white"
                  >
                    {v.sagaName} →
                  </ClientGatedWrap>
                  {v.sagaSeries && (
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                      {v.sagaSeries}
                    </span>
                  )}
                  {v.role && (
                    <span className="border border-white/20 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
                      {v.role}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {v.form && <Champ titre={messages.form} valeur={v.form} />}
                {v.age != null && (
                  <Champ titre={messages.age} valeur={`${v.age} ${messages.years}`} />
                )}
                {v.affiliation && <Champ titre={messages.affiliation} valeur={v.affiliation} />}
                {/* Les deux seules valeurs qu'on tienne d'une mesure et non d'une
						    rédaction : elles occupent le bloc tant que le reste n'est pas
						    écrit, et elles restent vraies après. */}
                {tomes && <Champ titre={messages.manga} valeur={tomes} />}
                {episodes && <Champ titre={messages.animatedSeries} valeur={episodes} />}
                {!!v.evidence?.planches && (
                  <Champ titre={messages.mangaPages} valeur={String(v.evidence.planches)} />
                )}
                {!!v.evidence?.synopsis && (
                  <Champ titre={messages.episodeSynopses} valeur={String(v.evidence.synopsis)} />
                )}
              </div>

              {summaryNodes[Math.min(variantIndex, variants.length - 1)] ? (
                <div className="prose-invert max-w-none text-sm">
                  {summaryNodes[Math.min(variantIndex, variants.length - 1)]}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-white/55">{messages.noSummary}</p>
              )}

              <section
                aria-label={messages.powerAria
                  .replace("{name}", characterName)
                  .replace("{version}", v.label)}
                className="space-y-3 border-t border-white/10 pt-4"
              >
                <h3 className="text-xs font-bold uppercase tracking-wider text-dbz-yellow">
                  {messages.powerHeading.replace("{version}", v.label)}
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {v.powerLevel ? (
                    <Champ titre={messages.powerLevel} valeur={v.powerLevel} />
                  ) : null}
                  {v.ki ? <Champ titre={messages.ki} valeur={v.ki} /> : null}
                  {v.maxKi ? <Champ titre={messages.maxKi} valeur={v.maxKi} /> : null}
                  {powerScalingNodes[variantIndex]}
                </div>
                {!v.powerLevel && !v.ki && !v.maxKi && !powerScalingNodes[variantIndex] && (
                  <p className="text-sm text-white/55">{messages.noPower}</p>
                )}
              </section>

              {(transformationNodes[variantIndex] || techniqueNodes[variantIndex]) && (
                <div className="grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
                  {transformationNodes[variantIndex] && (
                    <section
                      aria-label={messages.transformationsAria
                        .replace("{name}", characterName)
                        .replace("{version}", v.label)}
                    >
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-dbz-orange">
                        {messages.transformations}
                      </h3>
                      {transformationNodes[variantIndex]}
                    </section>
                  )}
                  {techniqueNodes[variantIndex] && (
                    <section
                      aria-label={messages.techniquesAria
                        .replace("{name}", characterName)
                        .replace("{version}", v.label)}
                    >
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-dbz-blue-light">
                        {messages.techniques}
                      </h3>
                      {techniqueNodes[variantIndex]}
                    </section>
                  )}
                </div>
              )}

              {/* Épisodes dont le TITRE nomme le personnage : ni un résumé ni une
					    interprétation, la liste de ce que la série a mis à son nom
					    pendant la saga. C'est le seul contenu de la variante qu'on
					    tienne d'une mesure et pas d'une rédaction. */}
              {v.keyEpisodes && v.keyEpisodes.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">
                    {messages.episodesNamed}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {v.keyEpisodes.map((e) => (
                      <li key={e.id}>
                        <ClientGatedWrap
                          access={access}
                          href={`/wiki/episodes/${e.id}`}
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dbz-border px-3 py-1.5 text-xs text-white/75 transition-colors hover:border-dbz-orange/50 hover:text-white"
                        >
                          <span className="tabular-nums text-dbz-orange/80">#{e.num}</span>
                          {e.title}
                        </ClientGatedWrap>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {v.highlights && v.highlights.length > 0 && (
                <ul className="space-y-2 text-sm text-white/75">
                  {v.highlights.map((h) => (
                    <li key={h} className="flex gap-3">
                      <span aria-hidden className="text-dbz-orange">
                        ▸
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Provenance — dit ce que la mesure prouve, et ce qu'elle ne prouve pas. */}
              {mesuree && (
                <p className="border-t border-white/10 pt-4 text-xs leading-relaxed text-white/45">
                  {v.origin === "synopsis-episodes"
                    ? messages.autoSynopsis
                    : v.origin === "ocr-manga"
                      ? messages.autoManga
                      : messages.autoBoth}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
