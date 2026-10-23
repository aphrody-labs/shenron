/**
 * Stand-in render worker of the pool tests. It answers like the real one, but what it does
 * with a card depends on the name in the input:
 *   "spin"   burns 150 ms of CPU, then answers (parallelism)
 *   "hang"   never answers (deadline)
 *   "crash"  dies with an uncaught error (fallback to the in-line renderer)
 *   other    answers at once
 */
declare const self: Worker;

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

self.addEventListener("message", (event: MessageEvent) => {
  const job = event.data as { type: string; id: number; input: { name?: string } };
  if (job.type !== "render") return;
  const mode = job.input?.name;
  if (mode === "hang") return;
  if (mode === "crash") {
    setTimeout(() => {
      throw new Error("stub worker crashed");
    }, 0);
    return;
  }
  if (mode === "spin") {
    const until = performance.now() + 150;
    while (performance.now() < until) Math.sqrt(Math.random());
  }
  const data = png.slice();
  self.postMessage(
    {
      type: "result",
      id: job.id,
      ok: true,
      card: {
        data,
        format: "png",
        contentType: "image/png",
        extension: "png",
        width: 8,
        height: 8,
        scale: 2,
        bytes: data.length,
        elapsedMs: 1,
        drawMs: 1,
        encodeMs: 0,
      },
    },
    [data.buffer],
  );
});
self.postMessage({ status: "ready" }, []);
