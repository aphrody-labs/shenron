// SPDX-License-Identifier: Apache-2.0

export {
  EXPECTED_SHENRON_ABI_VERSION,
  SHENRON_FFI_ABI,
  SHENRON_FFI_FILE,
  SHENRON_FFI_VERSION,
  SHENRON_NATIVE_BUN_RANGE,
  SHENRON_STATUS,
  shenronLoad,
  shenronLibraryPath,
  shenronAbiVersion,
  shenronVersion,
  shenronBuildInfo,
  shenronJobCount,
  lastError as shenronLastError,
  shenronRun,
  shenronRunCaptured,
  shenronLocalSearch,
  shenronRagSearch,
  shenronRagStats,
  shenronRagChunk,
  shenronAuthStatus,
  shenronPersonaPrompt,
  shenronPersonaAsk,
} from "./engine";
export { ShenronLibraryMismatch, type MismatchReason } from "./compat";
export type { CapturedResult as ShenronCapturedResult } from "./engine";
export type {
  AuthStatus as ShenronAuthStatusPayload,
  BuildInfo as ShenronBuildInfo,
  CapturedResult,
  JobOutcome,
  LocalHit,
  LocalSearchResponse,
  RagChunk,
  RagHit,
  RagSearchResponse,
  RagSourceStats,
  RagStats,
} from "./generated/types";
