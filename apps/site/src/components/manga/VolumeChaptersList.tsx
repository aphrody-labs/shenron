"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coche, Livre, Palette } from "@shenron/ui/icones";
import { assetUrl } from "@/lib/assets";
import {
  colorisationDemandee,
  editionDe,
  LIBELLE_EDITION,
  type Edition,
} from "@/lib/manga-editions";
import { Etoile } from "@shenron/ui/toriyama/MotifsCouverture";

interface Chapter {
  id: number;
  chapter_number: number;
  title: string | null;
  series: string;
  cover: string | null;
  pages?: string[] | null;
}

interface VolumeChaptersListProps {
  chapters: Chapter[];
}

export function VolumeChaptersList({ chapters }: VolumeChaptersListProps) {
  const [readChapterIds, setReadChapterIds] = useState<number[]>([]);
  const [edition, setEdition] = useState<Edition | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dbfr_read_chapters");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setReadChapterIds(parsed.map(Number));
        }
      }
    } catch (e) {
      console.error("Failed to load read chapters", e);
    }
    // L'édition demandée est lue depuis l'URL au montage, et NON via
    // `useSearchParams` : ce hook bascule la page en rendu dynamique et lui
    // ferait perdre son cache CDN, pour un simple onglet par défaut.
    try {
      const demandee = colorisationDemandee(
        new URLSearchParams(window.location.search).get("edition"),
      );
      if (demandee) setEdition(demandee);
    } catch {
      // Pas d'URL exploitable : on garde le choix par défaut.
    }
  }, []);

  const tousLisibles = chapters.filter((ch) => ch.pages && ch.pages.length > 0);
  const chapitresEnCoursIndexation = chapters.filter((ch) => !ch.pages || ch.pages.length === 0);
  const parEdition: Record<Edition, typeof tousLisibles> = {
    nb: tousLisibles.filter((ch) => editionDe(ch) === "nb"),
    couleur: tousLisibles.filter((ch) => editionDe(ch) === "couleur"),
  };
  const editionsPresentes = (["nb", "couleur"] as const).filter((e) => parEdition[e].length > 0);
  // Une édition demandée mais absente de ce tome ne doit pas vider la page.
  const editionActive: Edition =
    edition && parEdition[edition].length > 0 ? edition : (editionsPresentes[0] ?? "nb");

  const readableChapters = editionsPresentes.length ? parEdition[editionActive] : tousLisibles;
  const readReadableChapters = readableChapters.filter((ch) => readChapterIds.includes(ch.id));
  const progressPercent =
    readableChapters.length > 0
      ? Math.round((readReadableChapters.length / readableChapters.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Sélecteur d'édition : n'apparaît que si le tome existe dans les deux. */}
      {editionsPresentes.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choisir l'édition à lire">
          {editionsPresentes.map((e) => {
            const actif = e === editionActive;
            const Icone = e === "couleur" ? Palette : Livre;
            return (
              <button
                key={e}
                type="button"
                onClick={() => setEdition(e)}
                aria-pressed={actif}
                className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 font-display text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange/60 ${
                  actif
                    ? e === "couleur"
                      ? "bg-fuchsia-400 text-black"
                      : "bg-dbz-orange text-black"
                    : "border border-white/10 bg-black/40 text-white/70 hover:text-white"
                }`}
              >
                <Icone className="h-4 w-4" aria-hidden="true" />
                {LIBELLE_EDITION[e]}
                <span className="text-[12px] opacity-70 tabular-nums">{parEdition[e].length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Barre de progression style Scouter Toriyama */}
      {readableChapters.length > 0 && (
        <div className="space-y-2 rounded-xl border border-white/12 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-white/80">Progression de lecture</span>
            <span className="tabular-nums text-white/70">
              {readReadableChapters.length} sur {readableChapters.length} chapitres (
              {progressPercent} %)
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-label="Chapitres lus dans ce tome"
          >
            <div
              className="h-full bg-dbz-orange transition-[width] duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {readableChapters.map((ch) => {
          const isRead = readChapterIds.includes(ch.id);
          return (
            <Link
              key={ch.id}
              href={`/wiki/manga/${ch.id}`}
              onMouseEnter={() => {
                ch.pages?.slice(0, 3).forEach((page) => {
                  const img = new Image();
                  img.src = assetUrl(page);
                });
              }}
              className={`group flex min-h-11 items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:border-dbz-orange/60 md:p-4 ${isRead ? "border-emerald-600/70" : "border-white/12"}`}
            >
              <div className="flex items-center gap-4 md:gap-6 min-w-0">
                <span
                  className={`tabular-nums text-base md:text-lg min-w-[3.5rem] font-bold ${isRead ? "text-emerald-400" : "text-dbz-orange"}`}
                >
                  #{ch.chapter_number}
                </span>
                <p className="font-display font-bold text-white group-hover:text-dbz-orange transition-colors flex items-center gap-2 truncate">
                  {/* Puce d'étoile : la ligne de titre du support s'ouvre ainsi. */}
                  <Etoile taille={10} className="text-[var(--color-logo-rouge)] shrink-0" />
                  <span className="truncate">{ch.title || `Chapitre ${ch.chapter_number}`}</span>
                  {isRead && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-emerald-400 font-bold bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/40">
                      <Coche className="w-2.5 h-2.5" /> Lu
                    </span>
                  )}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-dbz-orange px-3.5 py-1.5 text-[13px] font-bold text-black">
                Lire
              </span>
            </Link>
          );
        })}
        {readableChapters.length === 0 && (
          <p className="text-white/60">
            Les chapitres de ce tome ne sont pas encore lisibles ici. Signale une source depuis{" "}
            <Link href="/wiki/contribute" className="text-dbz-orange hover:text-white">
              la page Contribuer
            </Link>
            .
          </p>
        )}
      </div>

      {chapitresEnCoursIndexation.length > 0 && (
        <section className="space-y-3 pt-4" aria-labelledby="indexed-chapters-title">
          <div className="flex items-center gap-3">
            <h3
              id="indexed-chapters-title"
              className="font-display text-sm font-bold text-white/70"
            >
              Sources et planches à raccorder
            </h3>
            <span className="text-[12px] text-white/45">{chapitresEnCoursIndexation.length}</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <p className="text-xs leading-relaxed text-white/50">
            Ces chapitres sont conservés pour la complétion du catalogue ; ils ne reçoivent aucun
            lien « Lire » tant que leurs planches n’ont pas été vérifiées et raccordées.
          </p>
          <div className="grid gap-2">
            {chapitresEnCoursIndexation.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center justify-between gap-4 rounded border border-white/10 bg-black/20 p-3 text-sm"
              >
                <span className="min-w-0 truncate font-display font-semibold text-white/75">
                  <span className="mr-2 tabular-nums">#{ch.chapter_number}</span>
                  {ch.title || `Chapitre ${ch.chapter_number}`}
                </span>
                <span className="shrink-0 text-[12px] text-white/40">À compléter</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
