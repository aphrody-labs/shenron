import type {
  EtatPipelinesLocaux,
  MangaUploadSerie,
  MangaUploadStatus,
  ProgressionGlobale,
} from "@/lib/databooks-transcription";
import type { TranscriptionsOverview } from "@/lib/transcriptions-admin";

/**
 * The corpus status the admin APIs serve (`/api/admin/databooks/status`,
 * `/api/admin/transcriptions`) with English names. Each view spreads the internal French-named
 * object first: its former names stay served as deprecated duplicates until 1.4.0, and the
 * English names are added next to them.
 */

type DatabooksPipeline = NonNullable<EtatPipelinesLocaux["databooks"]>;
type MangaPipeline = NonNullable<EtatPipelinesLocaux["manga"]>;

/** Totals of the databooks progression: `books`, `pages`, `transcribed`, … */
export function progressTotalView(total: ProgressionGlobale["total"]) {
  return {
    ...total,
    books: total.fiches,
    pages: total.planches,
    transcribed: total.transcrites,
    translated: total.traduites,
    withImage: total.avecImage,
    faulty: total.fautives,
    japaneseChars: total.signes,
  };
}

function databooksPipelineView(pipeline: DatabooksPipeline) {
  return {
    ...pipeline,
    state: pipeline.etat,
    generatedAt: pipeline.genereLe,
    lastActivity: pipeline.derniereActivite,
    results: pipeline.resultats,
    texts: pipeline.textes,
    remaining: pipeline.restant,
    activeBatch: pipeline.lotActif,
    gpu: pipeline.gpu && {
      ...pipeline.gpu,
      name: pipeline.gpu.nom,
      memoryUsed: pipeline.gpu.memoireUtilisee,
      memoryTotal: pipeline.gpu.memoireTotale,
      utilization: pipeline.gpu.utilisation,
    },
  };
}

function mangaPipelineView(pipeline: MangaPipeline) {
  return {
    ...pipeline,
    state: pipeline.etat,
    generatedAt: pipeline.genereLe,
    results: pipeline.resultats,
    texts: pipeline.textes,
    remaining: pipeline.restant,
    toReview: pipeline.aRelire,
    batches: pipeline.lots,
  };
}

/** The local OCR pipelines: `databooks` and `manga`, each with `state`, `results`, `texts`, … */
export function localPipelinesView(local: EtatPipelinesLocaux) {
  return {
    databooks: local.databooks && databooksPipelineView(local.databooks),
    manga: local.manga && mangaPipelineView(local.manga),
  };
}

/** One manga series of the upload status: `series`, `chapters`, `chaptersWithPages`, `pages`. */
export function uploadSeriesView(entry: MangaUploadSerie) {
  return {
    ...entry,
    series: entry.serie,
    chapters: entry.chapitres,
    chaptersWithPages: entry.chapitresAvecPages,
    pages: entry.planches,
  };
}

/** What the manga upload published in PostgreSQL: `chapters`, `pages`, `ocrPages`, … */
export function uploadStatusView(status: MangaUploadStatus) {
  return {
    ...status,
    series: status.series.map(uploadSeriesView),
    chapters: status.chapitres,
    chaptersWithPages: status.chapitresAvecPages,
    pages: status.planches,
    ocrPages: status.ocrPlanches,
    ocrPagesWithText: status.ocrPlanchesAvecTexte,
  };
}

/** The transcriptions overview with its manga series and local pipelines in English. */
export function overviewView(overview: TranscriptionsOverview) {
  return {
    ...overview,
    manga: {
      ...overview.manga,
      seriesBreakdown: overview.manga.seriesBreakdown.map(uploadSeriesView),
    },
    localPipelines: localPipelinesView(overview.localPipelines),
  };
}

export type TranscriptionsOverviewView = ReturnType<typeof overviewView>;
