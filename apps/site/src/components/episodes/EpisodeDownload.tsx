"use client";

import { Cadenas, Telecharger } from "@aphrody/shenron-ui/icones";
import { useMe } from "@/lib/use-me";
import { useVideoUIText } from "@/lib/video-ui-text";

interface EpisodeDownloadProps {
  /** Route server login-gated qui résout le MP4 (utilisée si connecté). */
  href: string;
  /** Chemin de retour après /signin si l'utilisateur n'est pas connecté. */
  signinCallback: string;
  title: string;
  className?: string;
}

/**
 * Bouton de téléchargement (épisodes & films). **Connexion Discord requise.**
 * L'état d'auth est lu côté client (`useMe`) → la page hôte reste cacheable
 * (ISR) sans `cookies()`. Déconnecté → cadenas + lien /signin ; connecté → lien
 * vers `href` (route server elle-même login-gated, défense en profondeur).
 * Pendant le chargement de l'état, on pointe sur `href` (la route bounce vers
 * /signin si besoin).
 */
export function EpisodeDownload({
  href,
  signinCallback,
  title,
  className = "",
}: EpisodeDownloadProps) {
  const me = useMe();
  const t = useVideoUIText();
  const loggedOut = me !== undefined && !me.authenticated;
  const target = loggedOut ? `/signin?callbackURL=${encodeURIComponent(signinCallback)}` : href;
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp4`;

  return (
    <a
      href={target}
      {...(loggedOut ? {} : { download: filename })}
      className={`shenron-video-download ${className}`}
      title={loggedOut ? t("downloadSignin") : t("downloadTitle", { title })}
      aria-label={loggedOut ? t("downloadSignin") : t("download")}
    >
      {loggedOut ? <Cadenas className="w-5 h-5" /> : <Telecharger className="w-5 h-5" />}
    </a>
  );
}
