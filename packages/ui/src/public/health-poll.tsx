// SPDX-License-Identifier: Apache-2.0
/** One bounded request at a time; hosts inject their transport and availability policy. */
export function startHealthPolling<T>(options: {
  load(signal: AbortSignal): Promise<T>;
  onUpdate(value: T): void;
  onError(): void;
  shouldPoll(value: T): boolean;
  timeoutMs?: number;
  intervalMs?: number;
}): () => void {
  let stopped = false;
  let controller: AbortController | undefined;
  let next: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped) return;
    controller = new AbortController();
    const active = controller;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let repeat = true;
    try {
      const aborted = new Promise<never>((_, reject) => {
        active.signal.addEventListener("abort", () => reject(active.signal.reason), { once: true });
        deadline = setTimeout(
          () => active.abort(new DOMException("Health timed out", "TimeoutError")),
          options.timeoutMs ?? 10_000,
        );
      });
      const load = async () => options.load(active.signal);
      const value = await Promise.race([load(), aborted]);
      if (!stopped) {
        repeat = options.shouldPoll(value);
        options.onUpdate(value);
      }
    } catch {
      if (!stopped) options.onError();
    } finally {
      clearTimeout(deadline);
      if (!active.signal.aborted) active.abort();
      if (!stopped && repeat) next = setTimeout(() => void run(), options.intervalMs ?? 3000);
    }
  };
  void run();
  return () => {
    stopped = true;
    clearTimeout(next);
    controller?.abort();
  };
}
