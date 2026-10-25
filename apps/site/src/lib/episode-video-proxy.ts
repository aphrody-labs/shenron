// SPDX-License-Identifier: Apache-2.0
import { approvedEpisodeVideoURL } from "./episode-video-source";
export { approvedEpisodeVideoURL } from "./episode-video-source";
const MAX_VIDEO_BYTES = 2 * 1024 ** 3;

export function validEpisodeVideoRange(range: string | null): boolean {
  if (range === null) return true;
  const match = /^bytes=(\d{1,10})?-(\d{1,10})?$/.exec(range);
  if (!match || (!match[1] && !match[2])) return false;
  const start = match[1] === undefined ? null : Number(match[1]);
  const end = match[2] === undefined ? null : Number(match[2]);
  return (
    (start === null || start < MAX_VIDEO_BYTES) &&
    (end === null || end < MAX_VIDEO_BYTES) &&
    (start === null || end === null || end >= start) &&
    !(start === null && end === 0)
  );
}

export async function streamEpisodeVideo(
  request: Request,
  source: string | null,
): Promise<Response> {
  const url = approvedEpisodeVideoURL(source);
  if (!url) return new Response(null, { status: 404 });
  const range = request.headers.get("range");
  if (!validEpisodeVideoRange(range)) return new Response(null, { status: 416 });
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  let timer = setTimeout(abort, 15000);
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
  };
  try {
    const upstream = await fetch(url, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: range ? { Range: range } : undefined,
      redirect: "error",
      signal: controller.signal,
    });
    clearTimeout(timer);
    timer = setTimeout(abort, 1800000);
    if (![200, 206, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      cleanup();
      return new Response(null, { status: 502 });
    }
    if (upstream.status === 416) {
      await upstream.body?.cancel();
      cleanup();
      return new Response(null, { status: 416 });
    }
    const length = Number(upstream.headers.get("content-length"));
    const contentRange = upstream.headers.get("content-range");
    const bounds = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if (
      upstream.headers.get("content-type")?.split(";")[0]?.trim() !== "video/mp4" ||
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      length > MAX_VIDEO_BYTES ||
      (upstream.status === 206 &&
        (!bounds ||
          !Number.isSafeInteger(Number(bounds[3])) ||
          Number(bounds[3]) > MAX_VIDEO_BYTES ||
          Number(bounds[2]) >= Number(bounds[3]) ||
          Number(bounds[2]) - Number(bounds[1]) + 1 !== length))
    ) {
      await upstream.body?.cancel();
      cleanup();
      return new Response(null, { status: 502 });
    }
    const headers = new Headers({
      "Content-Type": "video/mp4",
      "Content-Length": String(length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (contentRange) headers.set("Content-Range", contentRange);
    if (request.method === "HEAD" || !upstream.body) {
      cleanup();
      return new Response(null, { status: upstream.status, headers });
    }
    const reader = upstream.body.getReader();
    let received = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(output) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            if (received !== length) throw new Error("Video origin returned a truncated body");
            cleanup();
            output.close();
            return;
          }
          received += chunk.value.byteLength;
          if (received > length) throw new Error("Video origin exceeded its declared size");
          output.enqueue(chunk.value);
        } catch (error) {
          cleanup();
          abort();
          output.error(error);
        }
      },
      async cancel(reason) {
        cleanup();
        abort();
        await reader.cancel(reason).catch(() => {});
      },
    });
    return new Response(body, { status: upstream.status, headers });
  } catch {
    cleanup();
    return new Response(null, { status: 502 });
  }
}
