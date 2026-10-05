/**
 * RankTable — un classement de membres, une seule source de rendu de ligne.
 *
 * Trois classements écrivaient chacun leur ligne : le top 100 de
 * `/leaderboard` (un tableau de cinq colonnes, illisible à 360 px), le top
 * noteurs et le top Zénis du concours (deux listes identiques à une colonne
 * près). Ici, les lignes (`rows`) et les mesures (`metrics`) sont décrites une
 * fois, puis rendues deux fois depuis les mêmes données :
 *
 *  - **mobile** (`md:hidden`) : une carte par membre, toute la carte est le lien
 *    du profil, la mesure principale à droite, les autres sous le pseudo ;
 *  - **desktop** (`hidden md:table`) : un vrai tableau, en-têtes de colonne et de
 *    ligne pour les lecteurs d'écran.
 *
 * La version masquée par `display: none` sort de l'arbre d'accessibilité : un
 * lecteur d'écran ne lit qu'une des deux. Server component.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { T } from "@/components/T";

export type RankMetric = {
  key: string;
  /** En-tête de colonne, et libellé de la valeur sur la carte mobile. */
  label: ReactNode;
  /** Mesure qui fait le classement : à droite de la carte mobile. */
  primary?: boolean;
};

export type RankRow = {
  id: string;
  rank: number;
  href: string;
  name: string;
  avatar: string | null;
  /** Identifiant Discord : repli sur l'avatar Discord par défaut. */
  discordId?: string | null;
  values: Record<string, ReactNode>;
};

/** Or, argent, bronze — la couleur double le chiffre, elle ne le remplace pas. */
const PODIUM_TONE = ["text-amber-300", "text-slate-200", "text-orange-400"] as const;
const rankTone = (rank: number) => PODIUM_TONE[rank - 1] ?? "text-white/55";

export function RankTable({
  caption,
  metrics,
  rows,
  className = "",
}: {
  /** Titre du tableau pour les lecteurs d'écran (visuellement porté par la section). */
  caption: ReactNode;
  metrics: readonly RankMetric[];
  rows: readonly RankRow[];
  className?: string;
}) {
  const primary = metrics.find((m) => m.primary) ?? metrics.at(-1);
  const secondary = metrics.filter((m) => m !== primary);

  return (
    <div className={className}>
      <ol className="divide-y divide-white/12 md:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={row.href}
              className="flex min-h-14 items-center gap-3 py-2.5 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere"
            >
              <span
                className={`w-9 shrink-0 text-right text-base font-bold tabular-nums ${rankTone(row.rank)}`}
              >
                #{row.rank}
              </span>
              <Avatar
                src={row.avatar}
                userId={row.discordId}
                size={36}
                className="shrink-0 border border-white/10 bg-black/60"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{row.name}</span>
                {secondary.length > 0 && (
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-[0.75rem] text-white/55">
                    {secondary.map((m) => (
                      <span key={m.key}>
                        <span className="text-white/40">{m.label}</span> {row.values[m.key]}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {primary && (
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums text-white">
                    {row.values[primary.key]}
                  </span>
                  <span className="block text-[0.6875rem] text-white/45">{primary.label}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ol>

      <table className="hidden w-full border-collapse text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-white/12 text-left text-[0.75rem] text-white/55">
            <th scope="col" className="w-14 py-2 pr-3 font-semibold">
              <T k="communaute.classements.rankCol" />
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              <T k="communaute.classements.memberCol" />
            </th>
            {metrics.map((m) => (
              <th key={m.key} scope="col" className="py-2 pl-3 text-right font-semibold">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/12">
          {rows.map((row) => (
            <tr key={row.id} className={row.rank <= 3 ? "bg-white/[0.025]" : undefined}>
              <td className={`py-2 pr-3 text-base font-bold tabular-nums ${rankTone(row.rank)}`}>
                #{row.rank}
              </td>
              <th scope="row" className="py-1 pr-3 text-left font-normal">
                <Link
                  href={row.href}
                  className="group inline-flex min-h-11 max-w-full items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere"
                >
                  <Avatar
                    src={row.avatar}
                    userId={row.discordId}
                    size={32}
                    className="shrink-0 border border-white/10 bg-black/60"
                  />
                  <span className="truncate font-semibold text-white group-hover:text-dbz-orange">
                    {row.name}
                  </span>
                </Link>
              </th>
              {metrics.map((m) => (
                <td
                  key={m.key}
                  className={`py-2 pl-3 text-right tabular-nums ${m === primary ? "font-bold text-white" : "text-white/65"}`}
                >
                  {row.values[m.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
