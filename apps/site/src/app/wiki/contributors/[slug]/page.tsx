import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { dbUniverse } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";
import {
  Award,
  Calendar,
  BookOpen,
  Film,
  Music,
  Mic,
  Building2,
  CheckCircle2,
  Quote,
} from "lucide-react";
import { ANECDOTES_MAP } from "@/lib/unified-staff-catalog";

export const revalidate = 3600;

interface ContributorPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ContributorPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "akira-toriyama") {
    return ogMeta({
      title: "Akira Toriyama — L'Auteur & Créateur Démiurge de Dragon Ball",
      description:
        "Biographie officielle et paroles authentiques d'Akira Toriyama, créateur de Dragon Ball.",
      canonical: "/wiki/toriyama",
      type: "website",
    });
  }

  const contributor = await dbUniverse.contributorBySlug(slug);
  if (!contributor) return {};

  return {
    title: `${contributor.name} — Bâtisseurs de Dragon Ball`,
    description: contributor.biography_fr
      ? `${contributor.name} : ${contributor.biography_fr.slice(0, 160)}...`
      : `Fiche encyclopédique de ${contributor.name}, contributeur officiel de Dragon Ball.`,
    ...ogMeta({
      title: `${contributor.name} (${contributor.name_ja ?? ""}) — DBFR`,
      description: contributor.biography_fr ?? `Profil officiel de ${contributor.name}.`,
      canonical: `/wiki/contributors/${slug}`,
      type: "website",
    }),
  };
}

export default async function ContributorDetailPage({ params }: ContributorPageProps) {
  const { slug } = await params;

  // Redirection canonique vers la page dédiée consacrée à Toriyama
  if (slug === "akira-toriyama") {
    redirect("/wiki/toriyama");
  }

  const rawContributor = await dbUniverse.contributorBySlug(slug);
  let contributor = rawContributor;
  let voiceActor = null;

  if (!contributor) {
    voiceActor = await dbUniverse.voiceActorBySlug(slug);
    if (!voiceActor) {
      notFound();
    }
    // Adaptation au schéma d'affichage
    let parsedRoles: any[] = [];
    try {
      parsedRoles =
        typeof voiceActor.roles === "string"
          ? JSON.parse(voiceActor.roles)
          : voiceActor.roles || [];
    } catch {
      parsedRoles = [];
    }
    contributor = {
      id: Number(voiceActor.id),
      slug: voiceActor.slug,
      name: voiceActor.name,
      name_ja: voiceActor.name_ja,
      name_romaji: null,
      category: "voice" as any,
      birth_date: voiceActor.birth_date,
      death_date: null,
      biography_fr: voiceActor.biography || (voiceActor as any).article || null,
      image: voiceActor.image,
      spotlight_rank: null,
      credits: parsedRoles.map((r: any, idx: number) => ({
        id: idx + 1,
        role: `Voix : ${r.characterName}${r.notes ? ` (${r.notes})` : ""}`,
        credit_scope: r.series || "Dragon Ball",
        work_id: null,
        character_id: null,
        episode_id: null,
        movie_id: null,
        game_id: null,
        soundtrack_id: null,
      })),
    };
  }

  const categoryLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    author: {
      label: "Auteur & Mangaka",
      icon: <BookOpen aria-hidden="true" className="h-4 w-4" />,
      color: "border-orange-500/30 bg-orange-950/60 text-orange-400",
    },
    editorial_staff: {
      label: "Éditeur Shueisha (Jump)",
      icon: <Building2 aria-hidden="true" className="h-4 w-4" />,
      color: "border-blue-500/30 bg-blue-950/60 text-blue-400",
    },
    scenario: {
      label: "Scénariste Toei",
      icon: <Film aria-hidden="true" className="h-4 w-4" />,
      color: "border-purple-500/30 bg-purple-950/60 text-purple-400",
    },
    animation: {
      label: "Directeur Animation & Chara-design",
      icon: <Film aria-hidden="true" className="h-4 w-4" />,
      color: "border-emerald-500/30 bg-emerald-950/60 text-emerald-400",
    },
    voice: {
      label: "Comédien & Seiyū",
      icon: <Mic aria-hidden="true" className="h-4 w-4" />,
      color: "border-rose-500/30 bg-rose-950/60 text-rose-400",
    },
    music: {
      label: "Compositeur & Musicien",
      icon: <Music aria-hidden="true" className="h-4 w-4" />,
      color: "border-amber-500/30 bg-amber-950/60 text-amber-400",
    },
    publisher: {
      label: "Maison d'Édition / Studio",
      icon: <Building2 aria-hidden="true" className="h-4 w-4" />,
      color: "border-cyan-500/30 bg-cyan-950/60 text-cyan-400",
    },
    other: {
      label: "Staff & Contributeur",
      icon: <Award aria-hidden="true" className="h-4 w-4" />,
      color: "border-white/20 bg-white/5 text-white/80",
    },
  };

  const catMeta = categoryLabels[contributor.category] || categoryLabels.other!;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: contributor.name,
    alternateName: [contributor.name_ja, contributor.name_romaji].filter(Boolean),
    jobTitle: catMeta.label,
    description: contributor.biography_fr,
    birthDate: contributor.birth_date,
    deathDate: contributor.death_date,
  };

  return (
    <WikiDetailPage
      entity={contributor.name}
      source="db_contributors"
      jsonLd={jsonLd as never}
      crumbs={[{ label: "Staff & Créateurs", href: "/wiki/staff" }, { label: contributor.name }]}
      contributeKey="kit.contribute.what.character"
      header={
        <WikiEntityHeader
          name={contributor.name}
          nameJa={contributor.name_ja}
          nameRomaji={contributor.name_romaji}
          chips={
            <>
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold uppercase tracking-wider ${catMeta.color}`}
              >
                {catMeta.icon}
                <span>{catMeta.label}</span>
              </span>
              {contributor.spotlight_rank !== null && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-950/60 px-2.5 py-1 text-xs font-bold text-amber-300">
                  <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Personnalité Majeure
                </span>
              )}
            </>
          }
        >
          {(contributor.birth_date || contributor.death_date) && (
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/60">
              <span className="inline-flex items-center gap-1 font-mono text-white/50">
                <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
                {contributor.birth_date?.slice(0, 4) ?? "???"} —{" "}
                {contributor.death_date?.slice(0, 4) ?? "Présent"}
              </span>
            </div>
          )}
        </WikiEntityHeader>
      }
      aside={
        <>
          {contributor.image && !contributor.image.includes(".svg") ? (
            <div className="relative mx-auto h-28 w-28 sm:h-32 sm:w-32 shrink-0 overflow-hidden rounded-2xl border-2 border-orange-500/30 bg-black/60 shadow-xl">
              <img
                src={contributor.image}
                alt={contributor.name}
                className="h-full w-full object-cover object-top"
              />
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="relative mx-auto flex h-28 w-28 sm:h-32 sm:w-32 shrink-0 items-center justify-center rounded-2xl border-2 border-orange-500/30 bg-gradient-to-br from-orange-950/40 via-black to-neutral-900 shadow-xl"
            >
              <span className="font-saiyan text-4xl sm:text-5xl font-bold text-orange-400">
                {contributor.name.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/75">
              Rattachement Institutionnel
            </h3>
            <div>
              <div className="text-xs text-white/65">Catégorie Métier</div>
              <div className="text-sm font-semibold text-white">{catMeta.label}</div>
            </div>
            {contributor.birth_date && (
              <div>
                <div className="text-xs text-white/65">Date de Naissance</div>
                <div className="text-sm font-mono text-white/80">{contributor.birth_date}</div>
              </div>
            )}
            {contributor.death_date && (
              <div>
                <div className="text-xs text-white/65">Date de Décès</div>
                <div className="text-sm font-mono text-white/80">{contributor.death_date}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-white/65">Source des Données</div>
              <div className="text-sm leading-relaxed text-white/75">
                Archives éditoriales Shūeisha / Toei Animation
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-orange-500/20 bg-orange-950/20 p-5 backdrop-blur-md">
            <div className="text-xs font-bold text-orange-300">
              À propos de l&apos;auteur démiurge
            </div>
            <p className="mt-1 text-sm leading-relaxed text-orange-100/90">
              Pour consulter les déclarations textuelles et l&apos;anthologie complète d&apos;Akira
              Toriyama, rendez-vous sur l&apos;espace dédié.
            </p>
            <Link
              href="/wiki/toriyama"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-white transition-colors hover:text-orange-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange motion-reduce:transition-none"
            >
              <span>Anthologie Toriyama</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </>
      }
    >
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-orange-400">
          Notice Biographique &amp; Rôle Clé
        </h2>
        <p className="text-sm leading-relaxed text-white/80 whitespace-pre-line">
          {contributor.biography_fr ?? "Notice encyclopédique en cours de documentation vérifiée."}
        </p>
      </div>

      {/* Anecdote de production sourcée */}
      {ANECDOTES_MAP[slug] && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-6 backdrop-blur-md space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Quote aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Anecdote de Production &amp; Témoignage</span>
          </div>
          <p className="text-sm leading-relaxed text-amber-200/90 italic">
            &laquo; {ANECDOTES_MAP[slug]} &raquo;
          </p>
        </div>
      )}

      {/* Crédits officiels */}
      {contributor.credits.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
            Crédits &amp; Contributions Officielles ({contributor.credits.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contributor.credits.map((cr) => (
              <div key={cr.id} className="rounded-xl border border-white/10 bg-black/40 p-3.5">
                <div className="text-xs font-bold uppercase tracking-wider text-white/65">
                  Portée : {cr.credit_scope}
                </div>
                <div className="mt-1 break-words text-sm font-bold text-white">{cr.role}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </WikiDetailPage>
  );
}
