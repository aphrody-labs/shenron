#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * index-all-episodes-lecteurs.ts — Index all 826 Dragon Ball episodes and their video lecteurs into Aphrody RAG.
 */
import postgres from "postgres";

function requiredCredential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required from protected stores`);
  return value;
}

const PG_URL = requiredCredential("DATABASE_URL");
const RAG_ENDPOINT =
  process.env.APHRODY_AI_HTTP_URL || "http://127.0.0.1:8789/api/v1/shenron/rag/ingest";
const RAG_TOKEN = requiredCredential("APHRODY_AI_HTTP_TOKEN");

const SERIES_LABELS: Record<string, string> = {
  DB: "Dragon Ball",
  DBZ: "Dragon Ball Z",
  DBZ_KAI: "Dragon Ball Z Kai",
  DBZ_KAI_FINAL: "Dragon Ball Z Kai – Final Chapters",
  DBGT: "Dragon Ball GT",
  DBS: "Dragon Ball Super",
  DB_DAIMA: "Dragon Ball Daima",
};

interface EpisodeRow {
  id: number;
  series: string;
  number_in_series: number;
  title: string;
  title_ja: string | null;
  air_date: number | null;
  synopsis: string | null;
  synopsis_fr: string | null;
  players: Array<{ name?: string; provider?: string; lang?: string; embedUrl?: string }> | null;
  arc_name: string | null;
}

function formatDate(sec: number | null): string {
  if (!sec) return "Inconnue";
  return new Date(sec * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function main() {
  console.log("[Shenron RAG Indexer] Connecting to the configured PostgreSQL database.");
  const sql = postgres(PG_URL, { max: 5 });

  try {
    const episodes = await sql<EpisodeRow[]>`
      SELECT 
        e.id, 
        e.series, 
        e.number_in_series, 
        e.title, 
        e.title_ja, 
        e.air_date, 
        e.synopsis, 
        e.synopsis_fr, 
        e.players, 
        a.name AS arc_name
      FROM bot.db_episodes e
      LEFT JOIN bot.db_arcs a ON a.id = e.arc_id
      WHERE e.visible = true
      ORDER BY e.series, e.number_in_series
    `;

    console.log(`[Shenron RAG Indexer] ${episodes.length} épisodes trouvés dans bot.db_episodes.`);

    let indexedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i]!;
      const players = Array.isArray(ep.players) ? ep.players : [];
      const vf = players
        .filter((p) => p && p.lang === "vf")
        .map((p) => p.provider || p.name)
        .filter(Boolean);
      const vostfr = players
        .filter((p) => p && p.lang === "vostfr")
        .map((p) => p.provider || p.name)
        .filter(Boolean);

      const lecteursParts: string[] = [];
      if (vf.length > 0) lecteursParts.push(`VF (${[...new Set(vf)].join(", ")})`);
      if (vostfr.length > 0) lecteursParts.push(`VOSTFR (${[...new Set(vostfr)].join(", ")})`);

      const seriesFull = SERIES_LABELS[ep.series] ?? ep.series;
      const lecteurs =
        lecteursParts.length > 0
          ? `Lecteurs vidéo streaming disponibles : ${lecteursParts.join(" ; ")} sur le lecteur officiel https://dragonballfr.com/wiki/episodes/${ep.id}`
          : `Lecteur vidéo officiel : https://dragonballfr.com/wiki/episodes/${ep.id}`;

      const content = [
        `Épisode ${seriesFull} n° ${ep.number_in_series} : ${ep.title}${ep.title_ja ? ` (${ep.title_ja})` : ""}.`,
        ep.arc_name ? `Arc : ${ep.arc_name}.` : null,
        ep.air_date ? `Première diffusion : ${formatDate(ep.air_date)}.` : null,
        lecteurs,
        `Consulter la fiche et le lecteur de l'épisode : https://dragonballfr.com/wiki/episodes/${ep.id}`,
        ep.synopsis_fr || ep.synopsis,
      ]
        .filter(Boolean)
        .join("\n");

      const sourceId = `shenron:pg:db_episodes:${ep.id}`;
      const title = `${ep.series} ${ep.number_in_series} — ${ep.title}`;
      const url = `https://dragonballfr.com/wiki/episodes/${ep.id}`;

      const payload = {
        sourceId,
        title,
        url,
        content,
        kind: "episode",
        originSourceId: "db_episodes",
        entity: `${seriesFull} Épisode ${ep.number_in_series}`,
        lang: "fr",
      };

      try {
        const res = await fetch(RAG_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RAG_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          indexedCount++;
          if (indexedCount % 50 === 0 || indexedCount === episodes.length) {
            console.log(
              `[Shenron RAG Indexer] ${indexedCount}/${episodes.length} épisodes indexés avec leurs lecteurs...`,
            );
          }
        } else {
          errorCount++;
          const errText = await res.text();
          console.error(`Erreur sur l'épisode ${ep.id} (${res.status}): ${errText}`);
        }
      } catch (err) {
        errorCount++;
        console.error(`Exception sur l'épisode ${ep.id}:`, err);
      }
    }

    console.log(
      `\n[Shenron RAG Indexer] Indexation terminée : ${indexedCount} épisodes indexés, ${errorCount} erreurs.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Échec indexation épisodes:", err);
  process.exit(1);
});
