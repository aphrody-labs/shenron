import { pwaLocale, pwaText } from "@/lib/pwa";

export function GET(request: Request) {
  const lang = pwaLocale(new URL(request.url).searchParams.get("lang"));
  const t = pwaText(lang);
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
      background_color: "#211b27",
      theme_color: "#dec2ee",
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
