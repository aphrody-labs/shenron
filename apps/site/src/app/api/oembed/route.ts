import { type NextRequest, NextResponse } from "next/server";
import { SITE_URL } from "@/lib/config";
import { dbUniverse } from "@/lib/universe";
import { assetUrl } from "@/lib/assets";

export const revalidate = 3600;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  const format = searchParams.get("format") ?? "json";
  const maxWidth = Number(searchParams.get("maxwidth")) || 1280;
  const maxHeight = Number(searchParams.get("maxheight")) || 720;

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
  }

  if (format !== "json") {
    return NextResponse.json({ error: "Only json format is supported" }, { status: 501 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl, SITE_URL);
  } catch {
    return NextResponse.json({ error: "Invalid target URL" }, { status: 400 });
  }

  const pathname = parsed.pathname;

  // 1. Episode route: /wiki/episodes/[id]
  const episodeMatch = pathname.match(/^\/wiki\/episodes\/(\d+)$/);
  if (episodeMatch) {
    const episodeId = Number(episodeMatch[1]);
    const ep = await dbUniverse.episode(episodeId);
    if (!ep) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    const title = `${ep.title} — ${ep.series}`;
    const thumbnail = ep.image ? assetUrl(ep.image) : `${SITE_URL}/opengraph-image`;
    const embedUrl = `${SITE_URL}/embed/episodes/${ep.id}`;

    return NextResponse.json(
      {
        version: "1.0",
        type: "video",
        provider_name: "Dragon Ball FR · Shenron",
        provider_url: SITE_URL,
        author_name: "Akira Toriyama · Toei Animation",
        author_url: SITE_URL,
        title,
        description: ep.synopsis ?? undefined,
        width: Math.min(maxWidth, 1280),
        height: Math.min(maxHeight, 720),
        html: `<iframe src="${embedUrl}" width="${Math.min(maxWidth, 1280)}" height="${Math.min(maxHeight, 720)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
        thumbnail_url: thumbnail,
        thumbnail_width: 1280,
        thumbnail_height: 720,
        cache_age: 86400,
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  }

  // 2. Movie route: /wiki/movies/[slug]
  const movieMatch = pathname.match(/^\/wiki\/movies\/([a-zA-Z0-9_-]+)$/);
  if (movieMatch) {
    const slug = movieMatch[1];
    const m = await dbUniverse.movie(slug);
    if (!m) {
      return NextResponse.json({ error: "Movie not found" }, { status: 404 });
    }

    const title = `${m.title} — Dragon Ball`;
    const thumbnail = m.poster ? assetUrl(m.poster) : `${SITE_URL}/opengraph-image`;
    const embedUrl = `${SITE_URL}/wiki/movies/${m.slug}`;

    return NextResponse.json(
      {
        version: "1.0",
        type: "video",
        provider_name: "Dragon Ball FR · Shenron",
        provider_url: SITE_URL,
        author_name: "Akira Toriyama · Toei Animation",
        author_url: SITE_URL,
        title,
        description: m.synopsis ?? undefined,
        width: Math.min(maxWidth, 1280),
        height: Math.min(maxHeight, 720),
        html: `<iframe src="${embedUrl}" width="${Math.min(maxWidth, 1280)}" height="${Math.min(maxHeight, 720)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`,
        thumbnail_url: thumbnail,
        thumbnail_width: 1280,
        thumbnail_height: 720,
        cache_age: 86400,
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  }

  // 3. Fallback rich oEmbed
  return NextResponse.json(
    {
      version: "1.0",
      type: "rich",
      provider_name: "Dragon Ball FR · Shenron",
      provider_url: SITE_URL,
      title: "Dragon Ball FR — L'encyclopédie Dragon Ball",
      thumbnail_url: `${SITE_URL}/opengraph-image`,
      thumbnail_width: 1200,
      thumbnail_height: 630,
      cache_age: 86400,
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
