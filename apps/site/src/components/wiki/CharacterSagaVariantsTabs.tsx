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
import type { CharacterVariant } from "@/lib/shenron";
import type { CharacterSagaMessages } from "@/lib/wiki-character-version-messages";
import { verifiedCharacterVariantImage } from "@/lib/wiki-image-evidence";
import { Gauge, Sparkles, Zap } from "lucide-react";

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

export function CharacterSagaVariantsTabs({
  variants,
  overviewNode,
  characterName,
  powerScalingNodes,
  transformationNodes,
  techniqueNodes,
  messages,
  activeVariantIndex,
  showPortrait = true,
}: {
  variants: Omit<CharacterVariant, "summary">[];
  overviewNode: ReactNode;
  powerScalingNodes: ReactNode[];
  characterName: string;
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
          <div
            className={showPortrait ? "dbz-panel flex flex-col gap-6 p-6 sm:flex-row" : "w-full"}
          >
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

            <div className={showPortrait ? "min-w-0 flex-1 space-y-4" : "min-w-0 w-full"}>
              <section
                aria-label={messages.powerAria
                  .replace("{name}", characterName)
                  .replace("{version}", v.label)}
                className={`relative isolate ${showPortrait ? "mt-7" : ""} overflow-hidden rounded-3xl border border-dbz-purple/25 bg-gradient-to-br from-dbz-purple/[0.08] via-dbz-card/80 to-black/40 p-4 sm:p-6`}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-24 -top-24 -z-10 size-72 rounded-full bg-dbz-purple/[0.08] blur-3xl"
                />
                <header className="mb-6 flex items-start gap-3 sm:gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-dbz-purple/30 bg-dbz-purple/10 text-dbz-purple sm:size-12">
                    <Sparkles className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-dbz-purple">
                      {v.sagaName}
                    </p>
                    <h3 className="mt-1 font-saiyan text-xl uppercase tracking-wide text-white sm:text-2xl">
                      {messages.powersAndForms}
                    </h3>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/55">
                      {messages.abilitiesIntro}
                    </p>
                  </div>
                </header>

                {transformationNodes[variantIndex] && (
                  <section
                    aria-label={messages.transformationsAria
                      .replace("{name}", characterName)
                      .replace("{version}", v.label)}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-dbz-purple" aria-hidden="true" />
                      <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-white/85">
                        {messages.transformations}
                      </h4>
                      <span className="h-px flex-1 bg-gradient-to-r from-dbz-purple/30 to-transparent" />
                    </div>
                    {transformationNodes[variantIndex]}
                  </section>
                )}

                <div className="mt-6 grid items-start gap-4 border-t border-white/10 pt-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(15rem,0.75fr)] lg:gap-5">
                  <section
                    aria-label={messages.techniquesAria
                      .replace("{name}", characterName)
                      .replace("{version}", v.label)}
                    className="min-w-0 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="size-4 text-dbz-blue-light" aria-hidden="true" />
                      <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-white/85">
                        {messages.techniques}
                      </h4>
                      <span className="h-px flex-1 bg-gradient-to-r from-dbz-blue-light/30 to-transparent" />
                    </div>
                    {techniqueNodes[variantIndex] ?? (
                      <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                        {messages.noTechniques}
                      </p>
                    )}
                  </section>

                  <aside
                    aria-label={messages.powerHeading.replace("{version}", v.label)}
                    className="min-w-0 rounded-2xl border border-dbz-yellow/15 bg-black/20 p-4"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Gauge className="size-4 text-dbz-yellow" aria-hidden="true" />
                      <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-white/80">
                        {messages.powerHeading.replace("{version}", v.label)}
                      </h4>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                      {v.powerLevel ? (
                        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                            {messages.powerLevel}
                          </p>
                          <p className="mt-1 break-words font-mono text-sm font-bold text-dbz-yellow">
                            {v.powerLevel}
                          </p>
                        </div>
                      ) : null}
                      {v.ki && (
                        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                            {messages.ki}
                          </p>
                          <p className="mt-1 break-words font-mono text-sm font-bold text-dbz-yellow">
                            {v.ki}
                          </p>
                        </div>
                      )}
                      {v.maxKi && (
                        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                            {messages.maxKi}
                          </p>
                          <p className="mt-1 break-words font-mono text-sm font-bold text-dbz-yellow">
                            {v.maxKi}
                          </p>
                        </div>
                      )}
                    </div>
                    {powerScalingNodes[variantIndex] ??
                      (!v.powerLevel && !v.ki && !v.maxKi ? (
                        <p className="mt-3 text-sm leading-relaxed text-white/50">
                          {messages.noPower}
                        </p>
                      ) : null)}
                  </aside>
                </div>
              </section>

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
