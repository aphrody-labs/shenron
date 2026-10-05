/**
 * Tableaux du concours communautaire : « plus grand nombre de notes » et
 * « plus grand nombre de Zénis ». Composant de présentation pur — les deux
 * jeux de données sont chargés par la page (`/classements`) pour qu'un échec
 * de l'API du bot ne prive pas le site du classement des noteurs.
 *
 * Les deux tableaux écrivaient chacun leur ligne de rang ; ils passent
 * désormais par `RankTable` (cartes sur mobile, tableau sur desktop), comme le
 * top 100 de `/leaderboard`.
 */
import type { ReactNode } from "react";
import type { ContributorRow } from "@/lib/contributors";
import type { LeaderboardEntry } from "@/lib/shenron";
import { formatZeni } from "@/lib/zeni";
import { T } from "@/components/T";
import { RankTable } from "./RankTable";

const fmt = (n: number) => n.toLocaleString("fr-FR");

function Panel({
  id,
  kanji,
  title,
  subtitle,
  children,
}: {
  id: string;
  kanji: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className="scroll-mt-24 rounded-lg border border-white/12 p-4 sm:p-6"
    >
      <div className="border-b border-white/12 pb-4">
        <h3
          id={`${id}-titre`}
          className="flex items-center gap-2.5 text-[clamp(1.125rem,1rem+0.6vw,1.375rem)] font-[850] leading-tight tracking-[-0.02em] text-white"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 font-jp text-sm font-bold text-black"
          >
            {kanji}
          </span>
          {title}
        </h3>
        <p className="mt-1.5 text-sm text-white/65">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyBoard({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-white/60">{children}</p>;
}

/** Classement des membres qui ont déposé le plus de notes. */
export function TopRatersBoard({ rows }: { rows: ContributorRow[] }) {
  return (
    <Panel
      id="noteurs"
      kanji="評"
      title="Top noteurs du site"
      subtitle="Notes déposées sur les fiches épisodes, films, jeux et arcs. Départage aux avis rédigés."
    >
      {rows.length === 0 ? (
        <EmptyBoard>Aucune note enregistrée pour l&apos;instant — sois le premier.</EmptyBoard>
      ) : (
        <RankTable
          className="mt-3"
          caption="Top noteurs du site"
          metrics={[
            { key: "reviews", label: <T k="communaute.classements.reviewsCol" /> },
            { key: "comments", label: <T k="communaute.classements.commentsCol" /> },
            { key: "ratings", label: <T k="communaute.classements.ratingsCol" />, primary: true },
          ]}
          rows={rows.map((r) => ({
            id: r.userId,
            rank: r.rank,
            href: `/profil/${r.discordId}`,
            name: r.username,
            avatar: r.avatar,
            discordId: r.discordId,
            values: {
              reviews: fmt(r.ratingComments),
              comments: fmt(r.comments),
              ratings: `${fmt(r.ratings)} ★`,
            },
          }))}
        />
      )}
    </Panel>
  );
}

/** Classement des plus grosses fortunes en Zénis (économie du bot). */
export function TopZeniBoard({ rows }: { rows: LeaderboardEntry[] }) {
  return (
    <Panel
      id="zeni"
      kanji="銭"
      title="Top fortunes en Zénis"
      subtitle="Les plus riches du serveur Discord. Les Zénis se gagnent en activité, jeux et boutique."
    >
      {rows.length === 0 ? (
        <EmptyBoard>Le coffre est vide : le bot n&apos;a rien renvoyé.</EmptyBoard>
      ) : (
        <RankTable
          className="mt-3"
          caption="Top fortunes en Zénis"
          metrics={[
            { key: "level", label: <T k="communaute.classements.levelCol" /> },
            { key: "zeni", label: <T k="communaute.classements.zeniCol" />, primary: true },
          ]}
          rows={rows.map((e, i) => ({
            id: e.discordId,
            rank: e.rank || i + 1,
            href: `/profil/${e.discordId}`,
            name: e.username ?? `Guerrier #${e.discordId.slice(-4)}`,
            avatar: e.avatarUrl,
            discordId: e.discordId,
            values: { level: e.level, zeni: formatZeni(e.zeni) },
          }))}
        />
      )}
    </Panel>
  );
}
