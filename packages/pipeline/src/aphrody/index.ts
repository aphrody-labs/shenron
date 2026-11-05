// SPDX-License-Identifier: Apache-2.0
/**
 * @aphrody/shenron-pipeline/aphrody — clients for the Aphrody Rust services.
 *
 * Network clients use compute, Shenron E5 embeddings and the web crawler.
 * Product command adapters load the verified Aphrody FFI library when executed.
 * Importing this entry point does not load `bun:ffi`, `bun:sqlite` or `sharp`.
 * The A2A hub lives at `@aphrody/shenron-pipeline/aphrody/a2a`.
 */

export {
  AphrodyComputeClient,
  type AphrodyChatMessage,
  type AphrodyComputeOptions,
  type AphrodyRagDocument,
  type AphrodyRagHit,
  type AphrodyRagMode,
  type AphrodyRagStats,
  type AphrodyRagStoredDocument,
} from "./compute";
export {
  SHENRON_EMBED_DIMENSIONS,
  SHENRON_EMBED_MODEL,
  ShenronEmbeddingsClient,
  type ShenronEmbedKind,
  type ShenronEmbeddingsOptions,
} from "./shenron-embeddings";
export {
  aphrodyInfraCheck,
  aphrodyInfraStatus,
  type AphrodyInfraCheck,
  type AphrodyInfraTargetCheck,
} from "./infra";
