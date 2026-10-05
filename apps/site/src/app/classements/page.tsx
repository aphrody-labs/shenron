import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { SectionHeading } from "@shenron/ui/layout/SectionHeading";
import { Trophee } from "@shenron/ui/icones";
import { DomainBar } from "@/components/kit";
import { GatedLink } from "@/components/GatedLink";
import { Avatar } from "@/components/Avatar";
import { T } from "@/components/T";
import { CommunityTopsFull } from "@/components/ratings/CommunityTops";
import { Podium, PodiumCard, RANK_META, type PodiumRank } from "@/components/ratings/Podium";
import { TopRatersBoard, TopZeniBoard } from "@/components/contest/ContestBoards";
import { getCommunityTops } from "@/lib/community-tops-data";
import { COMMUNITY_TOP_BOARDS } from "@/lib/community-tops";
import { getShenronLeaderboard, type LeaderboardEntry } from "@/lib/shenron";
import { getTopRaters, type ContributorRow } from "@/lib/contributors";
import { ogMeta } from "@/lib/og";
import { formatZeni } from "@/lib/zeni";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Classements — Top 3 & Panthéon des Guerriers",
  description:
    "Top 3 épisodes DB, DBZ, Super, GT, Daima, Kai, films, jeux et Panthéon des Guerriers du serveur DBFR — classés par les votes et le Ki de la communauté.",
  ...ogMeta({
    title: "Classements — Top 3 & Panthéon des Guerriers",
    description: "Les Top 3 œuvres et le Panthéon des combattants de la communauté Dragon Ball FR.",
    type: "website",
    canonical: "/classements",
  }),
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

/** Ancres de la page : barre qui défile sur mobile, colonne collante dès `xl`. */
const ANCHORS = [
  { id: "guerriers", label: "Panthéon des guerriers" },
  { id: "noteurs", label: "Top noteurs" },
  { id: "zeni", label: "Top Zénis" },
  ...COMMUNITY_TOP_BOARDS.map((b) => ({ id: b.id, label: b.label })),
];

/** Une marche du Panthéon : le guerrier, son niveau, son XP. */
function WarriorStep({ entry, rank }: { entry: LeaderboardEntry | undefined; rank: PodiumRank }) {
  if (!entry) return null;
  const name = entry.username ?? `Guerrier #${entry.discordId.slice(-4)}`;
  return (
    <PodiumCard rank={rank} href={`/profil/${entry.discordId}`}>
      <div className="flex flex-col gap-2 px-3 pb-3 pt-10">
        <Avatar
          src={entry.avatarUrl}
          userId={entry.discordId}
          size={rank === 1 ? 80 : 64}
          className={`rounded-full border-2 ${RANK_META[rank].border} ${rank === 1 ? "h-16 w-16 sm:h-20 sm:w-20" : "h-12 w-12 sm:h-16 sm:w-16"}`}
          fluid
          fallback={
            <span className="flex h-full w-full items-center justify-center bg-black/40 text-white/30">
              <Trophee className="h-7 w-7" aria-hidden />
            </span>
          }
        />
        <p className="line-clamp-1 text-sm font-bold text-white group-hover:text-dbz-orange">
          {name}
        </p>
        <dl className="space-y-0.5 text-[0.75rem] text-white/60">
          <div className="flex justify-between gap-2">
            <dt>
              <T k="communaute.classements.levelCol" />
            </dt>
            <dd className="font-bold tabular-nums text-white">{entry.level}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>
              <T k="communaute.classements.xpCol" />
            </dt>
            <dd className="font-bold tabular-nums text-white">
              {entry.xp.toLocaleString("fr-FR")}
            </dd>
          </div>
          {rank === 1 && (
            <div className="flex justify-between gap-2">
              <dt>
                <T k="communaute.classements.zeniCol" />
              </dt>
              <dd className="font-bold tabular-nums text-white">{formatZeni(entry.zeni)}</dd>
            </div>
          )}
        </dl>
      </div>
    </PodiumCard>
  );
}

export default async function ClassementsPage() {
  const [data, warriors, raters, richest] = await Promise.all([
    getCommunityTops(),
    getShenronLeaderboard(3, true, 60, "xp", "general").catch(() => [] as LeaderboardEntry[]),
    // Postgres du site : indépendant de l'API du bot, donc le classement du
    // concours reste affiché même quand le bot est hors ligne.
    getTopRaters(20).catch(() => [] as ContributorRow[]),
    getShenronLeaderboard(20, true, 60, "zeni", "general").catch(() => [] as LeaderboardEntry[]),
  ]);

  return (
    <PageShell width="wide" rhythm="tight">
      {/* Pont staff → gestion des classements, invisible pour les visiteurs. */}
      <DomainBar
        domain="classements"
        actions={[{ href: "/admin/concours", label: "Arbitrer le concours" }]}
        className="mb-6"
      />

      <PageHeader
        title="Classements et podiums"
        subtitle="Le Panthéon des guerriers du serveur, les champions du concours et les Top 3 des œuvres, classés par les membres."
        className="mb-8"
      />

      <div className="xl:grid xl:grid-cols-[13rem_minmax(0,1fr)] xl:gap-10">
        <nav aria-label="Aller à un classement" className="mb-10 xl:mb-0">
          <ul className="-mx-[var(--shell-pad,1.5rem)] flex gap-2 overflow-x-auto px-[var(--shell-pad,1.5rem)] pb-1 [scrollbar-width:none] xl:sticky xl:top-24 xl:mx-0 xl:flex-col xl:gap-1 xl:overflow-visible xl:px-0 [&::-webkit-scrollbar]:hidden">
            {ANCHORS.map((a) => (
              <li key={a.id} className="shrink-0">
                <a
                  href={`#${a.id}`}
                  className={`inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm text-white/75 transition-colors hover:border-white/40 hover:text-white xl:flex xl:rounded-lg xl:border-transparent xl:px-3 ${FOCUS}`}
                >
                  {a.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-14">
          <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-white/70">
            Le Panthéon suit l&apos;XP et l&apos;activité du serveur Discord. Les Top 3 des œuvres
            (épisodes, films, jeux et arcs) se classent en direct avec les notes des membres.
            {data.globalVotes > 0 && (
              <>
                {" "}
                Déjà {data.globalVotes} vote{data.globalVotes > 1 ? "s" : ""} enregistré
                {data.globalVotes > 1 ? "s" : ""}.
              </>
            )}
          </p>

          <section id="guerriers" className="scroll-mt-24 space-y-6">
            <SectionHeading
              title="Panthéon des guerriers"
              standfirst="Les trois combattants les plus actifs du serveur Discord. L'XP se gagne en discutant."
              actions={
                <Link
                  href="/leaderboard"
                  className={`inline-flex min-h-11 items-center rounded-full border border-white/20 px-4 text-sm font-semibold text-white transition-colors hover:border-white/50 ${FOCUS}`}
                >
                  Classement complet
                </Link>
              }
            />
            {warriors.length > 0 ? (
              <Podium render={(rank) => <WarriorStep entry={warriors[rank - 1]} rank={rank} />} />
            ) : (
              <p className="rounded-lg border border-white/12 p-6 text-center text-sm text-white/65">
                Le bot ne renvoie aucun guerrier pour l&apos;instant. Le podium se remplit dès
                qu&apos;un membre gagne de l&apos;XP sur le serveur Discord.
              </p>
            )}
          </section>

          <section aria-labelledby="concours-titre" className="space-y-6">
            <SectionHeading
              id="concours-titre"
              title="Champions de la communauté"
              standfirst="Deux classements de membres : celui qui note et commente le plus de fiches, et celui qui amasse le plus de Zénis sur Discord. Chaque profil est public, notes et avis compris."
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <TopRatersBoard rows={raters} />
              <TopZeniBoard rows={richest} />
            </div>
          </section>

          <section className="space-y-6">
            <SectionHeading
              title="Podiums des œuvres"
              standfirst="Épisodes, films, jeux et arcs, série par série. Une place libre se prend en notant."
            />
            <CommunityTopsFull data={data} />
          </section>

          <section className="rounded-lg border border-white/12 p-5 sm:p-7">
            <h2 className="text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-[850] leading-tight tracking-[-0.02em] text-white">
              Fais monter tes favoris
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/65">
              Connecte-toi avec Discord, ouvre une fiche épisode, film ou jeu, et donne ta note de 1
              à 5 étoiles. Chaque vote compte.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/wiki/episodes"
                className={`inline-flex min-h-11 items-center rounded-full bg-dbz-orange px-5 text-sm font-bold text-black transition-colors hover:bg-white ${FOCUS}`}
              >
                Noter un épisode
              </Link>
              <Link
                href="/wiki/films"
                className={`inline-flex min-h-11 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white hover:border-white/50 ${FOCUS}`}
              >
                Noter un film
              </Link>
              <GatedLink
                href="/wiki/jeux"
                className={`inline-flex min-h-11 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white hover:border-white/50 ${FOCUS}`}
              >
                Noter un jeu
              </GatedLink>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
