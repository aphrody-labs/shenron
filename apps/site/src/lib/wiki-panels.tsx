/**
 * Construit les **panneaux de contenu** d'une fiche wiki (catégories du
 * sélecteur) à partir d'une **seule source de vérité**, choisie par priorité :
 *
 *   1. les sections éditoriales `bot.db_wiki_sections` (studio) SI la fiche en a
 *      — elles définissent **seules** les catégories (ordre `sort_order`,
 *      masquage `visible`, libellé/corps édités au studio font foi) ;
 *   2. sinon, l'`article` long-format éclaté par titre `##`
 *      (`splitArticleSections`) — bootstrap gratuit d'une fiche non migrée ;
 *   3. sinon, la `description` courte en une seule section « Histoire ».
 *
 * Pour les personnages, seules les rubriques qui portent du contenu sont
 * conservées ; la page les rassemble dans le modèle éditorial commun.
 *
 * db-first-replace (pas un merge) : dès qu'une section existe, masquer /
 * réordonner / supprimer / éditer au studio se répercute fidèlement (l'article
 * n'est plus consulté). Rendu 100 % côté serveur (SEO/ISR préservés).
 */
import type { WikiSectionLink } from "@/db/bot-schema";
import { getWikiSections } from "@/lib/shenron";
import {
  sectionAccent,
  sectionSlug,
  splitArticleSections,
  type SectionAccent,
} from "@/lib/wiki-article-sections";
import { WikiArticle } from "@/components/wiki/WikiArticle";
import { WikiSectionLinks } from "@/components/wiki/WikiSectionLinks";
import { PwsStatSection } from "@/components/wiki/PwsStatSection";
import Link from "next/link";
import { Crayon } from "@aphrody/shenron-ui/icones";
import { normalizeWikiSectionGroups, PWS_GROUP_NAME } from "@/lib/wiki-section-groups";
import type { ReaderPanel } from "@/components/wiki/WikiSectionsReader";
import { tableForSectionEntity } from "@/lib/wiki-entity-model";

export interface ContentPanel extends ReaderPanel {
  /** Slug de section (sert au merge des galeries relationnelles). */
  key: string;
  accent: SectionAccent;
  /**
   * `db` = la fiche est pilotée par `db_wiki_sections`, et son `article` n'est
   * PAS rendu. La page s'en sert pour ne pas proposer de corriger un article
   * que personne ne verra — 266 fiches personnage sont dans ce cas.
   */
  origine: "db" | "article" | "description";
}

interface RawSection {
  key: string;
  label: string;
  body: string;
  accent: SectionAccent;
  group?: string | null;
  links?: WikiSectionLink[];
  /**
   * D'où vient la section — c'est ce qui décide **où** une correction doit
   * être déposée. Une section `db` s'édite ligne à ligne (précis) ; une
   * section tirée de l'article s'édite dans l'article (texte entier).
   */
  origine?: "db" | "article" | "description";
  /** `db_wiki_sections.id` quand l'origine est `db`. */
  sectionId?: number;
}

/**
 * Sections de contenu d'une entité (source unique : DB → article → description).
 * Retourne des `ContentPanel` prêts pour `WikiSectionsReader`, à clés uniques.
 * Vide si aucune source.
 */
export async function buildWikiContentPanels({
  entityType,
  entityId,
  article,
  description,
  preferArticle = false,
  articleTarget,
  fallbackHeading = "Histoire",
}: {
  entityType: string;
  entityId: number;
  article?: string | null;
  description?: string | null;
  preferArticle?: boolean;
  articleTarget?: { table: string; rowId: number };
  fallbackHeading?: string;
}): Promise<ContentPanel[]> {
  // Source de vérité : sections DB si présentes (éditables/masquables/ordonnées
  // au studio), sinon l'article éclaté, sinon la description.
  const dbSections = preferArticle ? [] : await getWikiSections(entityType, entityId);
  let raw: RawSection[];
  if (dbSections.length > 0) {
    raw = normalizeWikiSectionGroups(
      dbSections.map((s) => ({
        key: s.key || sectionSlug(s.label),
        label: s.label,
        body: s.body,
        accent: s.accent ?? sectionAccent(s.label),
        group: s.groupLabel,
        links: s.links,
        origine: "db" as const,
        sectionId: s.id,
      })),
    );
  } else if (article?.trim()) {
    raw = normalizeWikiSectionGroups(
      splitArticleSections(article, fallbackHeading).map((s) => ({
        key: s.key,
        label: s.label,
        body: s.body,
        accent: s.accent,
        group: null as string | null,
        origine: "article" as const,
      })),
    );
  } else if (description?.trim()) {
    raw = [
      {
        key: sectionSlug(fallbackHeading),
        label: fallbackHeading,
        body: description.trim(),
        accent: "orange",
        origine: "description" as const,
      },
    ];
  } else {
    raw = [];
  }

  // Les fiches personnage suivent le modèle éditorial commun. N'injecte pas
  // des sous-rubriques PWS vides : leurs informations éventuelles sont
  // regroupées avec « Pouvoirs et formes » par la page personnage.
  if (entityType === "character") {
    raw = raw.filter(
      (section) => section.body.trim() || !section.group?.toLowerCase().includes("pws"),
    );
  }

  // Clés uniques (garde-fou : deux sections de même slug ne cassent pas React).
  const seen = new Set<string>();
  return raw.map((s) => {
    let key = s.key;
    let n = 2;
    while (seen.has(key)) key = `${s.key}-${n++}`;
    seen.add(key);
    const links = s.links ?? [];
    const isPws = s.group === PWS_GROUP_NAME;
    const origine = s.origine ?? "article";
    // Où déposer une correction de CETTE rubrique. Une section en base
    // s'édite ligne à ligne ; une rubrique issue de l'article s'édite dans
    // l'article, qui est le texte réellement rendu.
    const cible =
      origine === "db" && s.sectionId != null
        ? { table: "db_wiki_sections", rowId: s.sectionId, column: "body" }
        : {
            table: articleTarget?.table ?? tableForSectionEntity(entityType) ?? undefined,
            rowId: articleTarget?.rowId ?? entityId,
            column: "article",
          };

    return {
      key,
      label: s.label,
      accent: s.accent,
      group: s.group ?? null,
      origine,
      node: isPws ? (
        <div className="space-y-2">
          <PwsStatSection label={s.label} body={s.body} accent={s.accent} />
          {links.length > 0 && <WikiSectionLinks links={links} />}
        </div>
      ) : (
        <div className="space-y-2">
          {s.body.trim() ? (
            <WikiArticle
              article={s.body}
              heading={/source|référence|reference/.test(`${s.key} ${s.label}`) ? "" : s.label}
              accent={s.accent}
            />
          ) : (
            <SectionAEcrire label={s.label} cible={cible} />
          )}
          {links.length > 0 && <WikiSectionLinks links={links} />}
          {/* Corriger là où l'on lit — mais par un LIEN, pas un îlot client.
					    Une modale par rubrique, c'est un composant client par section
					    sur ~1 300 fiches : trois builds sont morts en OOM dessus. Le
					    lien est rendu côté serveur et coûte zéro octet de JS. */}
          {s.body.trim() && cible.table ? (
            <div className="pt-1">
              <LienCorriger cible={cible} />
            </div>
          ) : null}
        </div>
      ),
    } satisfies ContentPanel;
  });
}

/**
 * Rubrique attendue mais pas encore écrite. Elle affichait un titre nu — ce qui
 * ressemble à un bug plus qu'à un manque. Elle dit maintenant ce qu'elle est et
 * propose de la remplir, en visant l'endroit qui sera réellement rendu.
 */
function LienCorriger({ cible }: { cible: { table?: string; rowId: number; column: string } }) {
  if (!cible.table) return null;
  const params = new URLSearchParams({
    table: cible.table,
    row: String(cible.rowId),
    col: cible.column,
  });
  return (
    <Link
      href={`/wiki/corrections?${params}`}
      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/30 transition-colors hover:text-dbz-orange"
    >
      <Crayon className="h-3 w-3" /> Corriger cette partie
    </Link>
  );
}

function SectionAEcrire({
  label,
  cible,
}: {
  label: string;
  cible: { table?: string; rowId: number; column: string };
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-saiyan text-2xl text-white">{label}</h2>
      <p className="text-sm leading-relaxed text-white/45">
        Cette partie n&apos;est pas encore écrite.
      </p>
      {cible.table ? (
        <Link
          href={`/wiki/corrections?${new URLSearchParams({ table: cible.table, row: String(cible.rowId), col: cible.column })}`}
          className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-white/65 transition-colors hover:border-dbz-orange/50 hover:text-white"
        >
          <Crayon className="h-3.5 w-3.5" /> Écrire «&nbsp;{label}&nbsp;»
        </Link>
      ) : null}
    </div>
  );
}
