// SPDX-License-Identifier: Apache-2.0
/** Bun product policy; acquisition and portable parsing remain owned by Aphrody Web. */
export { enrichCatalogue, validateCatalogue } from "./catalogue";
export type { DragonBallCatalogue, CatalogueCollection, CatalogueVolume } from "./catalogue";
export { enrichDragonBallCatalogue } from "./enrichment";
export type { CatalogueDepositOptions } from "./enrichment";
export { importDragonBallCovers, createPostgresCoverAssetPort } from "./assets";
export type { CoverImportOptions, CoverAssetPort, CoverAssetRecord } from "./assets";
export { importDragonBallManga, createPostgresMangaEditorialPort } from "./manga";
export type { MangaImportOptions, MangaEditorialPort, MangaVolume, MangaChapter } from "./manga";
export {
  DRAGON_BALL_DATASET_FAMILIES,
  sourceManifestSchema,
  sourceCatalogSchema,
  datasetManifestSchema,
  datasetCatalogSchema,
  verifySource,
  verifyDataset,
  auditCatalog,
  auditDatasetCoverage,
} from "./source-coverage";
export { loadDatasetInventory, resolveDatasetEditorialFreeze } from "./dataset-inventory";
export {
  approvedTrainingDatasetCatalogSchema,
  createApprovedTrainingDatasetPort,
} from "./training-dataset";
export {
  DragonBallAutomation,
  AutomationBlocked,
  createNativeCollectionPort,
  createNativeRagPorts,
} from "./automation";
export type {
  AutomationStage,
  AutomationContext,
  AutomationInput,
  AutomationCheckpoint,
  CollectionPlan,
  CollectionProof,
  RagProof,
  RetrievalProof,
  PreparedDataset,
  TrainingArtifact,
  HeldoutProof,
  DragonBallAutomationPorts,
  StageOutcome,
} from "./automation";
export type {
  DatasetInventory,
  DatasetInventoryOptions,
  DatasetUnavailable,
} from "./dataset-inventory";
export type {
  SourceManifest,
  DatasetManifest,
  VerifiedDataset,
  CoverageGap,
} from "./source-coverage";
export {
  discoverTechniqueImages,
  eligibleTechniqueImageUrl,
  techniqueDocumentsFromNativeWiki,
  techniqueDocumentsFromNativeCrawl,
  techniqueDocumentsFromNativeMarkdown,
  techniqueDocumentsFromEditorialArticles,
} from "./technique-images";
export type {
  TechniqueImageIdentity,
  TechniqueImageDocument,
  TechniqueImageCandidate,
} from "./technique-images";
