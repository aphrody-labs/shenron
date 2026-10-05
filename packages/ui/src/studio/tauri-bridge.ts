// SPDX-License-Identifier: Apache-2.0
/** Minimal Tauri host detection and command invocation for the Shenron studio screens. */

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as { __TAURI__?: { core?: unknown } }).__TAURI__?.core ||
        (window as unknown as { __TAURI_INTERNALS__?: { invoke: unknown } }).__TAURI_INTERNALS__,
    )
  );
}

export async function tauriInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T | null> {
  if (!isTauri()) return null;
  const tauri = (window as unknown as {
    __TAURI__?: { core?: { invoke<R>(command: string, args?: Record<string, unknown>): Promise<R> } };
  }).__TAURI__;
  if (tauri?.core) return tauri.core.invoke<T>(cmd, args);
  const internals = (window as unknown as {
    __TAURI_INTERNALS__?: { invoke: <R>(c: string, a: Record<string, unknown>) => Promise<R> };
  }).__TAURI_INTERNALS__;
  return internals?.invoke ? internals.invoke<T>(cmd, args) : null;
}

export interface ShenronChatResponse {
  answer: string;
  mode: string;
  hits: Array<{ title: string; url: string; snippet: string; score: number; kind: string; source_id?: string | null }>;
}

/** Ask the public, grounded Shenron chat through the desktop host. */
export async function askShenron(query: string): Promise<ShenronChatResponse> {
  const result = await tauriInvoke<ShenronChatResponse>("aphrody_shenron_chat", { query });
  if (!result) throw new Error("L’assistant Shenron est disponible dans l’application de bureau.");
  return result;
}
