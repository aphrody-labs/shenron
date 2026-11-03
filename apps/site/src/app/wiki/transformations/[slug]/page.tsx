import { hasEditorialDatabase } from "@/lib/prerender";
import { EntityParticipation } from "@/components/social/EntityParticipation";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { GatedWrap } from "@/components/GatedLink";
import { TrackView } from "@/components/TrackView";
import { WikiArticle, WikiSources } from "@/components/wiki/WikiArticle";
import { assetUrl } from "@/lib/db-universe";
import { getShenronTransformation, getTransformationsAvecArticle } from "@/lib/shenron";
import { ogMeta } from "@/lib/og";
import { resolveTransformationParam } from "@/lib/wiki-slugs";

import { WikiImg } from "@/components/wiki/WikiImg";

export const revalidate = 3600;

export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const list = await getTransformationsAvecArticle();
  return list.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = resolveTransformationParam(slug);
  const t = await getShenronTransformation(resolved.id ?? resolved.canonicalSlug ?? slug);
  if (!t) notFound();
  const qui = t.character ? ` de ${t.character.name}` : "";
  const description = `La transformation ${t.name}${qui} : origine, apparence et effets, d'après le manga et les databooks.`;
  return {
    title: `${t.name} — Transformation Dragon Ball`,
    description,
    ...ogMeta({
      title: `${t.name} — DBFR`,
      description,
      image: t.image ? assetUrl(t.image) : undefined,
      canonical: `/wiki/transformations/${t.slug}`,
    }),
  };
}

export default async function TransformationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = resolveTransformationParam(slug);
  const t = await getShenronTransformation(resolved.id ?? resolved.canonicalSlug ?? slug);
  if (!t) notFound();

  // Redirection 301 pour les anciens ID numériques ou les alias
  if (resolved.isLegacyNumericId || resolved.isAlias || slug !== t.slug) {
    permanentRedirect(`/wiki/transformations/${t.slug}`);
  }

  return (
    <WikiDetailPage
      entity={t.name}
      source="db_transformations"
      image={t.image}
      imageAlt={t.name}
      tracker={
        <TrackView
          entityType="transformation"
          entityId={t.id}
          entityName={t.name}
          image={t.image}
        />
      }
      crumbs={[{ label: "Transformations", href: "/wiki/transformations" }, { label: t.name }]}
      edit={{
        table: "db_transformations",
        id: t.id,
        indexHref: "/wiki/transformations",
        label: t.name,
      }}
      header={
        <WikiEntityHeader
          name={t.name}
          chips={
            <span className="font-saiyan text-xs tracking-[0.2em] uppercase text-dbz-orange">
              TRANSFORMATION CANON
            </span>
          }
        >
          {t.character && (
            <p className="text-base sm:text-lg text-white/80 font-medium">
              Forme de{" "}
              <GatedWrap
                href={`/wiki/characters/${t.character.slug}`}
                className="text-dbz-orange font-semibold underline-offset-4 hover:underline hover:text-dbz-yellow transition-colors"
              >
                {t.character.name}
              </GatedWrap>
            </p>
          )}
        </WikiEntityHeader>
      }
      aside={
        <>
          <div className="wiki-infobox">
            <div className="wiki-infobox-header">FICHE TECHNIQUE</div>
            {t.image && (
              <div className="relative aspect-[3/4] w-full overflow-hidden border-b-2 border-black bg-black">
                <WikiImg
                  src={t.image}
                  alt={t.name}
                  sizes="(max-width: 1024px) 100vw, 380px"
                  className="object-cover object-top"
                  placeholderClassName="w-full h-full flex items-center justify-center bg-black"
                />
              </div>
            )}
            <table className="w-full text-left text-xs sm:text-sm">
              <tbody>
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">Nom</th>
                  <td className="wiki-infobox-value font-semibold text-white">{t.name}</td>
                </tr>
                {t.character && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">Personnage</th>
                    <td className="wiki-infobox-value">
                      <GatedWrap
                        href={`/wiki/characters/${t.character.slug}`}
                        className="text-dbz-orange hover:underline font-medium"
                      >
                        {t.character.name}
                      </GatedWrap>
                    </td>
                  </tr>
                )}
                {t.ki && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">Ki Requis</th>
                    <td className="wiki-infobox-value font-scouter text-dbz-orange font-bold">
                      {t.ki}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Autres formes du personnage */}
          {t.voisines.length > 0 && (
            <div className="wiki-content-card space-y-4">
              <h3 className="font-saiyan text-sm uppercase tracking-wider text-dbz-orange flex items-center gap-2">
                <span className="w-1.5 h-3 bg-dbz-orange inline-block" />
                Formes associées
              </h3>
              <ul className="flex flex-wrap gap-2">
                {t.voisines.map((v) =>
                  v.aArticle ? (
                    <li key={v.id}>
                      <GatedWrap
                        href={`/wiki/transformations/${v.slug}`}
                        className="inline-flex rounded-md border-2 border-black bg-black/60 px-3 py-1.5 text-xs font-medium text-white/90 shadow-[2px_2px_0px_#000] transition-all hover:bg-dbz-orange hover:text-black"
                      >
                        {v.name}
                      </GatedWrap>
                    </li>
                  ) : (
                    <li
                      key={v.id}
                      className="inline-flex rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/40"
                      title="Cette forme n'a pas encore d'article"
                    >
                      {v.name}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
        </>
      }
    >
      {t.article && t.article.trim() ? (
        <div className="wiki-content-card">
          <WikiArticle article={t.article} heading="Description" accent="orange" />
        </div>
      ) : (
        <div className="wiki-content-card text-center py-12 text-sm italic text-white/50">
          Cette transformation n&apos;a pas encore d&apos;article encyclopédique rédigé.
        </div>
      )}

      <WikiSources sources={t.articleSources as never} />
      <EntityParticipation
        kind="wiki"
        table="db_transformations"
        id={t.id}
        path={`/wiki/transformations/${slug}`}
        label={t.name}
      />
    </WikiDetailPage>
  );
}
