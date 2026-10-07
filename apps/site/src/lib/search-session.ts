/** Own one debounced request; disposal prevents every late callback. */
export function startSearchSession<T>(
  load: (signal: AbortSignal) => Promise<T>,
  callbacks: { success(value: T): void; failure(): void; settled(): void },
  { debounceMs = 180, timeoutMs = 10_000 } = {},
): () => void {
  const controller = new AbortController();
  let active = true;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  function finish() {
    active = false;
    clearTimeout(deadline);
    callbacks.settled();
  }
  const debounce = setTimeout(() => {
    deadline = setTimeout(() => {
      if (!active) return;
      controller.abort();
      callbacks.failure();
      finish();
    }, timeoutMs);
    void (async () => {
      try {
        const value = await load(controller.signal);
        if (active) callbacks.success(value);
      } catch {
        if (active) callbacks.failure();
      } finally {
        if (active) finish();
      }
    })();
  }, debounceMs);
  return () => {
    active = false;
    clearTimeout(debounce);
    clearTimeout(deadline);
    controller.abort();
  };
}
