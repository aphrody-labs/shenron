// SPDX-License-Identifier: Apache-2.0
import {
  buildVideoPlan,
  parseVideoRequest,
  type VideoCard,
  type VideoSource,
} from "../../packages/media/src/video-plan";
import fr from "./messages/fr.json";
import en from "./messages/en.json";
import ja from "./messages/ja.json";

export async function readVideoRequest() {
  const reader = Bun.stdin.stream().getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timeout = setTimeout(() => {
    void reader.cancel(new Error("Input timed out after 5 seconds"));
  }, 5000);
  const started = Date.now();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 16384) throw new RangeError("Request exceeds 16 KiB");
      chunks.push(chunk.value);
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  if (Date.now() - started >= 5000) throw new Error("Input timed out after 5 seconds");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return parseVideoRequest(JSON.parse(new TextDecoder().decode(bytes) || "{}"));
}
async function publicSource(url: string): Promise<{ text: string; source: VideoSource }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    redirect: "error",
    headers: { Accept: "application/json,text/html" },
  });
  if (!response.ok) throw new Error(`Public source returned ${response.status}`);
  if (!response.body) throw new Error("Source has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Source exceeds bounded metadata size");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder().decode(bytes);
  return {
    text,
    source: {
      url,
      sha256: new Bun.CryptoHasher("sha256").update(text).digest("hex"),
      fetchedAt: new Date().toISOString(),
    },
  };
}
export async function collectVideoPlan(input: unknown) {
  const request = parseVideoRequest(input);
  const labels = { fr, en, ja }[request.language][request.kind];
  const cards: VideoCard[] = [];
  const sources: VideoSource[] = [];
  if (request.kind === "chronology") {
    const result = await publicSource("https://dragonballfr.com/api/timeline");
    sources.push(result.source);
    const payload = JSON.parse(result.text) as { entries?: Record<string, unknown>[] };
    if (!Array.isArray(payload.entries)) throw new Error("Timeline source has no entries");
    const eras = new Set<unknown>();
    for (const item of payload.entries) {
      if (cards.length === request.maxCards) break;
      if (eras.has(item.era)) continue;
      eras.add(item.era);
      const title =
        request.language === "ja" && typeof item.titleJa === "string" ? item.titleJa : item.title;
      if (typeof title !== "string" || typeof item.href !== "string")
        throw new Error("Invalid curated entry");
      const href = new URL(item.href);
      if (href.origin !== "https://dragonballfr.com") throw new Error("Unexpected timeline origin");
      cards.push({
        title,
        subtitle: typeof item.eraLabel === "string" ? item.eraLabel : undefined,
        href: href.href,
        date: typeof item.date === "string" ? item.date : undefined,
        provenance: `${result.source.url}; editorial rank ${String(item.rank)}; source field ${request.language === "ja" && typeof item.titleJa === "string" ? "titleJa" : "title"}; requested language ${request.language}`,
      });
    }
  } else if (request.kind === "beerus") {
    const result = await publicSource("https://dragonballfr.com/news");
    sources.push(result.source);
    const urls = [
      ...new Set(
        [...result.text.matchAll(/href=["']([^"']*\/news\/[^"'#?]+)["']/g)].map(
          (match) => new URL(match[1]!, result.source.url).href,
        ),
      ),
    ]
      .filter((url) => new URL(url).pathname.startsWith("/news/dragon-ball-super-beerus-"))
      .slice(0, request.maxCards);
    const articles = await Promise.all(
      urls.filter((url) => new URL(url).origin === "https://dragonballfr.com").map(publicSource),
    );
    for (const article of articles) {
      const url = article.source.url;
      sources.push(article.source);
      let title = "";
      let published = "";
      // Consume the streaming rewriter before reading the extracted metadata.
      const rewriter = new HTMLRewriter()
        .on('meta[property="og:title"]', {
          element(element) {
            title = element.getAttribute("content") ?? "";
          },
        })
        .on('meta[property="article:published_time"]', {
          element(element) {
            published = element.getAttribute("content") ?? "";
          },
        });
      await rewriter.transform(new Response(article.text)).text();
      if (title)
        cards.push({
          title,
          href: url,
          date: /^\d{4}-\d{2}-\d{2}T/.test(published) ? published.slice(0, 10) : undefined,
          provenance: `${url}; public metadata; source title language fr`,
        });
    }
  } else {
    const geometry = Bun.file(
      `${process.env.SHENRON_VIDEO_PROJECT_ROOT ?? process.cwd()}/packages/ui/src/toriyama-svg/kinto-un.ts`,
    );
    const bytes = await geometry.arrayBuffer();
    sources.push({
      url: "https://github.com/aphrody-labs/shenron/blob/main/packages/ui/src/toriyama-svg/kinto-un.ts",
      sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      fetchedAt: new Date().toISOString(),
    });
    cards.push({
      title: labels.title,
      subtitle: labels.subtitle,
      provenance: "Shenron original geometric artwork; Apache-2.0; no episode footage",
    });
  }
  return buildVideoPlan(request, { cards, sources, labels });
}
if (import.meta.main) {
  try {
    console.log(JSON.stringify(await collectVideoPlan(await readVideoRequest())));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Video planning failed");
    process.exitCode = 1;
  }
}
