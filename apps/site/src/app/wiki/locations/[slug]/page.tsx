import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GatedWrap } from "@/components/GatedLink";
import { dbUniverse } from "@/lib/db-universe";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { ogMeta } from "@/lib/og";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loc = await dbUniverse.locationBySlug(slug);
  if (!loc) return { title: "Lieu introuvable" };

  return {
    title: `${loc.name} — Lieux & Sanctuaires`,
    description: loc.description,
    ...ogMeta({
      title: `${loc.name} — Dragon Ball FR`,
      description: loc.description,
      type: "article",
      canonical: `/wiki/locations/${slug}`,
    }),
  };
}

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loc = await dbUniverse.locationBySlug(slug);
  if (!loc) notFound();

  const allBattles = (await dbUniverse.battles()) ?? [];
  const locBattles = allBattles.filter((b) => {
    if (!b.location) return false;
    const lNorm = b.location.toLowerCase();
    const nameNorm = loc.name.toLowerCase();
    return lNorm.includes(nameNorm) || nameNorm.includes(lNorm);
  });

  return (
    <WikiDetailPage
      entity={loc.name}
      source="db_locations"
      image={loc.image}
      imageAlt={loc.name}
      crumbs={[
        { label: "Encyclopédie", href: "/wiki" },
        { label: "Lieux & Sanctuaires", href: "/wiki/locations" },
        { label: loc.name, href: `/wiki/locations/${loc.slug}` },
      ]}
      edit={{ table: "db_locations", id: loc.id, indexHref: "/wiki/locations", label: loc.name }}
      header={
        <WikiEntityHeader
          name={loc.name}
          nameJa={loc.name_ja}
          nameRomaji={loc.name_romaji}
          chips={
            <>
              <span className="rounded-md bg-orange-500/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-orange-400">
                {loc.realm_type}
              </span>
              {loc.planet && (
                <span className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-white/60">
                  🪐 {loc.planet}
                </span>
              )}
            </>
          }
        />
      }
      aside={
        <div className="wiki-infobox">
          <div className="wiki-infobox-header">{loc.name}</div>
          <table className="w-full text-left text-xs sm:text-sm">
            <tbody>
              <tr className="wiki-infobox-row">
                <th className="wiki-infobox-label">Domaine</th>
                <td className="wiki-infobox-value font-semibold text-white">{loc.realm_type}</td>
              </tr>
              <tr className="wiki-infobox-row">
                <th className="wiki-infobox-label">Première apparition Manga</th>
                <td className="wiki-infobox-value">{loc.debut_chapter ?? "Non renseigné"}</td>
              </tr>
              <tr className="wiki-infobox-row">
                <th className="wiki-infobox-label">Première apparition Anime</th>
                <td className="wiki-infobox-value">{loc.debut_episode ?? "Non renseigné"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    >
      <div className="rounded-2xl border border-white/10 bg-black/30 p-5 leading-relaxed text-sm text-white/80">
        {loc.description}
      </div>

      {/* Événements marquants */}
      {loc.key_events && loc.key_events.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>⚡</span> Événements & Chroniques
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loc.key_events.map((ev) => (
              <div
                key={ev.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-2"
              >
                <h3 className="font-bold text-white text-base text-orange-400">{ev.title}</h3>
                <p className="text-xs leading-relaxed text-white/70">{ev.description}</p>
                {ev.mangaRef && (
                  <div className="text-[11px] font-mono text-white/40 pt-1">📖 {ev.mangaRef}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Combats Légendaires sur ce Lieu */}
      {locBattles.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>⚔️</span> Combats Légendaires sur ce Lieu ({locBattles.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {locBattles.map((b) => (
              <GatedWrap
                key={b.slug}
                href="/wiki/events"
                className="block rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-2 hover:border-orange-500/40 hover:bg-orange-500/[0.04] transition-all"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-orange-400">{b.series}</span>
                  {b.winner_name && (
                    <span className="text-emerald-400 font-medium">
                      🏆 Vainqueur : {b.winner_name}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-white text-base">{b.title}</h3>
                {b.climax_summary && (
                  <p className="text-xs leading-relaxed text-white/70">{b.climax_summary}</p>
                )}
              </GatedWrap>
            ))}
          </div>
        </div>
      )}
    </WikiDetailPage>
  );
}
