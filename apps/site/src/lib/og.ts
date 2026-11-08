import type { Metadata } from "next";
import { SITE_URL } from "@/lib/config";

/**
 * Fragment de métadonnées Open Graph + Twitter Card réutilisable.
 * `image` doit être une URL ABSOLUE (ex. `assetUrl(...)` renvoie déjà des URLs
 * absolues vers le bot) ; les chemins relatifs ne sont PAS résolus ici — pour
 * un défaut relatif, c'est `metadataBase` du layout + le fichier
 * `app/opengraph-image.tsx` qui s'en chargent.
 * Sans `image`, on retombe sur la carte de marque (`app/opengraph-image.tsx`),
 * référencée par son URL. Compter sur l'héritage ne marche PAS : déclarer
 * `openGraph` sur une page remplace l'objet hérité, image comprise.
 */
export function ogMeta({
  title,
  description,
  image,
  video,
  type = "article",
  canonical,
}: {
  title: string;
  description?: string;
  image?: string | null;
  video?: string | null;
  type?: "article" | "website" | "video.episode" | "video.movie";
  /**
   * URL canonique auto-référente de la page (chemin relatif, ex. `/wiki/sagas`,
   * résolu contre `metadataBase` du layout). À renseigner page par page :
   * une canonical globale pointerait à tort toutes les pages vers la home.
   */
  canonical?: string;
}): Pick<Metadata, "openGraph" | "twitter" | "alternates" | "other"> {
  // Sans image propre, on pointe EXPLICITEMENT la carte de marque.
  //
  // Le commentaire d'origine affirmait que la page « hérite alors de l'OG image
  // par défaut » : c'est faux, et vérifié deux fois en production le
  // 2026-08-21. Déclarer `openGraph` dans les métadonnées d'une page REMPLACE
  // l'objet hérité — l'image dérivée de `app/opengraph-image.tsx` comprise. Ni
  // `images: undefined`, ni l'omission de la clé n'y changent rien. Résultat :
  // `/shop`, `/leaderboard`, `/rankings`, `/stats`, `/games` et toutes les
  // fiches sans visuel n'émettaient AUCUN `og:image` — un partage Discord ou
  // Twitter sans vignette, sur un site adossé à Discord — alors que les pages
  // n'appelant PAS ce helper, elles, l'avaient.
  //
  // L'URL est celle de la route générée, sans sa clé de cache (un simple
  // paramètre de requête) : elle sert bien le PNG 1200×630.
  const fallback = `${SITE_URL}/opengraph-image`;
  const src = image ?? fallback;
  const images = { images: [{ url: src, alt: title }] };
  const twitterImages = { images: [src] };
  const isVideo = Boolean(video && (type === "video.episode" || type === "video.movie"));
  const videoEntries =
    isVideo && video
      ? {
          videos: [
            {
              url: video,
              secureUrl: video,
              type: "video/mp4",
              width: 1920,
              height: 1080,
            },
          ],
        }
      : {};
  const twitterPlayer =
    isVideo && video
      ? {
          player: {
            url: video,
            width: 1920,
            height: 1080,
            streamUrl: video,
          },
        }
      : {};

  const fullCanonical = canonical
    ? `${SITE_URL}${canonical.startsWith("/") ? "" : "/"}${canonical}`
    : SITE_URL;
  return {
    alternates: {
      ...(canonical ? { canonical } : {}),
      types: {
        "application/json+oembed": `${SITE_URL}/api/oembed?url=${encodeURIComponent(fullCanonical)}&format=json`,
      },
    },
    openGraph: {
      siteName: "Dragon Ball FR · Shenron",
      locale: "fr_FR",
      alternateLocale: ["ja_JP", "en_US"],
      title,
      description,
      type: type === "video.episode" || type === "video.movie" ? "video.other" : type,
      ...(canonical ? { url: canonical } : {}),
      ...images,
      ...videoEntries,
    },
    twitter: {
      card: isVideo ? "player" : "summary_large_image",
      site: "@dragonballfr",
      creator: "@dragonballfr",
      title,
      description,
      ...twitterImages,
      ...twitterPlayer,
    },
    other: {
      "theme-color": "#e65100",
      ...(isVideo && video
        ? {
            "og:video:type": "video/mp4",
            "og:video:width": "1920",
            "og:video:height": "1080",
          }
        : {}),
    },
  };
}
