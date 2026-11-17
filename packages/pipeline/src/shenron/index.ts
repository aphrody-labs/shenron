// SPDX-License-Identifier: Apache-2.0
/**
 * @aphrody/shenron-pipeline/shenron — clients for the Shenron Rust services.
 *
 * Network clients use compute, Shenron E5 embeddings and the web crawler.
 * Product command adapters load the verified Shenron FFI library when executed.
 * Importing this entry point does not load `bun:ffi`, `bun:sqlite` or `sharp`.
 * The A2A hub lives at `@aphrody/shenron-pipeline/shenron/a2a`.
 */

export {
  ShenronComputeClient,
  type ShenronChatMessage,
  type ShenronComputeOptions,
  type ShenronRagDocument,
  type ShenronRagHit,
  type ShenronRagMode,
  type ShenronRagStats,
  type ShenronRagStoredDocument,
} from "./compute";
export {
  SHENRON_EMBED_DIMENSIONS,
  SHENRON_EMBED_MODEL,
  ShenronEmbeddingsClient,
  type ShenronEmbedKind,
  type ShenronEmbeddingsOptions,
} from "./shenron-embeddings";
export {
  shenronInfraCheck,
  shenronInfraStatus,
  type ShenronInfraCheck,
  type ShenronInfraTargetCheck,
} from "./infra";
