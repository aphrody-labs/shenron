// SPDX-License-Identifier: Apache-2.0
/**
 * Shenron result adapters over shenron-ffi (`@aphrody/shenron-native`). The calls that can last
 * (commands, serving RAG search and statistics: network) run on the `@aphrody/shenron-native/worker`
 * pool, off the event loop and cancellable by `AbortSignal`; the instant ones stay synchronous.
 */
import {
  EXPECTED_SHENRON_ABI_VERSION,
  shenronAbiVersion,
  shenronVersion,
  shenronRunCaptured,
  shenronAuthStatus,
  shenronPersonaPrompt,
  type RagSearchResponse,
  type RagStats,
  type ShenronAuthStatusPayload,
} from "@aphrody/shenron-native/shenron";
import { shenronWorkerPool } from "@aphrody/shenron-native/worker";
import type { AphrodyDoctorResult, CliResult } from "./cli";
import { AphrodyComputeClient, type AphrodyRagHit, type AphrodyRagStats } from "./compute";

export const EXPECTED_ABI_VERSION = EXPECTED_SHENRON_ABI_VERSION;
export interface ShenronAuthStatus {
  configured: boolean;
  adminCredentialsPresent: boolean;
}
function nativeValue<T>(operation: () => T): T | null {
  try {
    return operation();
  } catch {
    return null;
  }
}
/** As `nativeValue`, for a worker call; an abort is the caller's and propagates. */
async function nativeAsync<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}
/** Check the shared owner on demand; transient failures are not cached here. */
export function isNativeAvailable(): boolean {
  return nativeAbiVersion() !== null;
}
export function nativeAbiVersion(): number | null {
  return nativeValue(shenronAbiVersion);
}
export function nativeVersion(): string | null {
  return nativeValue(shenronVersion);
}
export function runCapturedNative(
  args: readonly string[],
): { code: number; stdout: string; stderr: string } | null {
  return nativeValue(() => shenronRunCaptured([...args]));
}

/**
 * High-level native client exposing in-process Aphrody operations.
 */
export class AphrodyNativeClient {
  get isAvailable(): boolean {
    return isNativeAvailable();
  }

  /** Run a command on a native worker and return classified CliResult. */
  async run<T = unknown>(
    args: readonly string[],
    options: { signal?: AbortSignal } = {},
  ): Promise<CliResult<T>> {
    const t0 = performance.now();
    const captured = await nativeAsync(
      () => shenronWorkerPool().runCaptured(args, options),
      options.signal,
    );
    const durationMs = Math.round(performance.now() - t0);

    if (!captured) {
      return {
        kind: "not_found",
        bin: "aphrody_ffi",
        message: "Native FFI library not available on this platform",
      };
    }

    if (captured.code === 0) {
      try {
        const data = JSON.parse(captured.stdout.trim()) as T;
        return {
          kind: "exit",
          ok: true,
          code: 0,
          data,
          stdout: captured.stdout,
          stderr: captured.stderr,
          durationMs,
        };
      } catch {
        return {
          kind: "exit",
          ok: true,
          code: 0,
          data: undefined,
          stdout: captured.stdout,
          stderr: captured.stderr,
          durationMs,
        };
      }
    }

    return {
      kind: "exit",
      ok: false,
      code: captured.code,
      stdout: captured.stdout,
      stderr: captured.stderr,
      durationMs,
    };
  }

  /** Fetch doctor diagnostics through the Shenron-scoped ABI (which adds its namespace). */
  async doctor(): Promise<AphrodyDoctorResult | null> {
    const res = await this.run<AphrodyDoctorResult>(["doctor", "--json"]);
    return res.kind === "exit" && res.ok ? (res.data ?? null) : null;
  }

  /** Query the serving Shenron RAG (normalised by the library), scores rescaled to [0.4, 1]. */
  async ragSearch(
    query: string,
    options: { limit?: number; kind?: string; signal?: AbortSignal } = {},
  ): Promise<AphrodyRagHit[]> {
    // The selected PostgreSQL backend must also govern calls through this facade.
    if (process.env.RAG_BACKEND === "aphrody") {
      return new AphrodyComputeClient().ragSearch(query, options.limit ?? 5, {
        kind: options.kind,
      });
    }
    const answer: RagSearchResponse | null = await nativeAsync(
      () =>
        shenronWorkerPool().ragSearch(query, {
          limit: Math.trunc(Math.max(1, Math.min(options.limit ?? 5, 100))),
          kind: options.kind || undefined,
          signal: options.signal,
        }),
      options.signal,
    );
    if (!answer) return [];
    const ranked: AphrodyRagHit[] = answer.results.map((row) => ({
      title: row.title || "Sans titre",
      url: row.url,
      snippet: row.snippet,
      score: row.score ?? 0,
      kind: row.kind,
      sourceId: row.sourceId ?? undefined,
      lang: row.lang ?? undefined,
      content: row.content || row.snippet,
    }));
    const scores = ranked.map((row) => row.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    return ranked.map((row) =>
      Object.assign({}, row, {
        score: max > min ? 0.4 + (0.6 * (row.score - min)) / (max - min) : 1,
      }),
    );
  }

  /** Fetch RAG index corpus statistics (normalised by the library). */
  async ragStats(options: { signal?: AbortSignal } = {}): Promise<AphrodyRagStats | null> {
    if (process.env.RAG_BACKEND === "aphrody") return new AphrodyComputeClient().ragStats();
    const stats: RagStats | null = await nativeAsync(
      () => shenronWorkerPool().ragStats(options),
      options.signal,
    );
    if (!stats) return null;
    return {
      chunks: stats.chunks,
      vectors: stats.vectors,
      ...(stats.vectorsStored === null ? {} : { vectorsStored: stats.vectorsStored }),
      sources: stats.sources.map((source) =>
        Object.assign(
          { sourceId: source.sourceId, kind: source.kind, count: source.count },
          source.vectors === null ? {} : { vectors: source.vectors },
        ),
      ),
    };
  }

  /** Return only the sanitized authentication presence flags. */
  authStatus(): ShenronAuthStatus | null {
    const envelope = nativeValue(shenronAuthStatus);
    if (!envelope) return null;
    try {
      if (envelope.code !== 0 || typeof envelope.stdout !== "string") return null;
      const status = JSON.parse(envelope.stdout.trim()) as Partial<ShenronAuthStatusPayload>;
      if (
        typeof status.configured !== "boolean" ||
        typeof status.admin_credentials_present !== "boolean"
      ) {
        return null;
      }
      return {
        configured: status.configured,
        adminCredentialsPresent: status.admin_credentials_present,
      };
    } catch {
      return null;
    }
  }

  /** Fetch sovereign persona prompt. */
  async personaPrompt(): Promise<string | null> {
    return nativeValue(shenronPersonaPrompt);
  }
}

/** Global singleton instance */
export const aphrodyNative = new AphrodyNativeClient();
