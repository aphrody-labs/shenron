import { pwaLocale, pwaText, pwaTheme, pwaPalette } from "@/lib/pwa";

export function GET(request: Request) {
  const lang = pwaLocale(new URL(request.url).searchParams.get("lang"));
  const t = pwaText(lang);
  const colors = pwaPalette[pwaTheme(new URL(request.url).searchParams.get("theme"))];
  return Response.json(
    {
      id: "/",
      scope: "/",
      start_url: "/",
      lang,
      name: "DBFR — Dragon Ball France",
      short_name: "DBFR",
      description: t.description,
      display: "standalone",
      background_color: colors.background,
      theme_color: colors.background,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: t.manga, url: "/wiki/manga" },
        { name: t.episodes, url: "/wiki/episodes" },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
