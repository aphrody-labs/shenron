"use client";
/* oxlint-disable eslint/no-shadow, jsx-a11y/prefer-tag-over-role, react/exhaustive-effect-dependencies, react/iframe-missing-sandbox, react/no-array-index-key, react/set-state-in-effect, react-hooks/exhaustive-deps -- reviewed: legacy patterns, behavior preserved */

import { useEffect, useMemo, useRef, useState } from "react";
import { type SubtitleTrack, VideoPlayer } from "@/components/episodes/VideoPlayer";
import { HyperFramesPlayer } from "@/components/episodes/HyperFramesPlayer";
import { track } from "@/lib/telemetry";
import { probePlayerNetwork } from "@/lib/player-network";
import { isShenronEpisodeVideoURL } from "@/lib/episode-video-source";
import { nextPlayerIndex, resolvePlayerIndex } from "@/lib/video-selection-state";
import { useTranslations } from "next-intl";
import { useVideoUIText } from "@/lib/video-ui-text";
import {
  preferredSelection,
  readVideoLanguagePreference,
  writeVideoLanguagePreference,
} from "@/lib/video-language-preference";
import { officialCrunchyrollWatchURL } from "@aphrody/shenron-config/video-providers";
import { normalizeVideoPlayers } from "@aphrody/shenron-media/episode-playback";
import {
  normalizeVideoLanguage,
  officialProviderName,
  playersForVideoLanguage,
  resolveVideoSelection,
  videoLanguages,
} from "@/lib/video-languages";

export interface Lecteur {
  name: string;
  provider: string;
  embedUrl: string;
  lang?: "vf" | "vostfr" | "vost";
}

/**
 * Lecture en VO dans le lecteur du site, avec les pistes de sous-titres de la fiche.
 *
 * Les lecteurs externes sont des `<iframe>` d'une autre origine : aucune piste ne
 * peut s'y superposer. Tant que la page n'offrait qu'eux, les sous-titres
 * japonais moissonnés depuis jimaku (~750 épisodes au 2026-09-13) étaient servis
 * par `/api/subtitles` sans jamais s'afficher. Ce mode passe par le proxy HLS du
 * bot sur la variante VOSTFR — audio japonais —, dans notre `<video>`, où les
 * `<track>` fonctionnent.
 */
export interface LecteurVo {
  /** Playlist maître du proxy HLS, variante VOSTFR (`…/master.m3u8?lang=vostfr`). */
  src: string;
  title: string;
  poster?: string;
  subtitles: SubtitleTrack[];
}

/** Retire le préfixe « VF · » / « VOSTFR · » que l'import ajoute au nom du lecteur
 *  (la langue est désormais portée par le sélecteur dédié). */
function cleanName(name: string): string {
  return name.replace(/^\s*(VF|VOSTFR|VOST)\s*·\s*/i, "").trim();
}

function isCrunchyrollHost(value: string): boolean {
  try {
    const host = new URL(value).hostname;
    return host === "crunchyroll.com" || host.endsWith(".crunchyroll.com");
  } catch {
    return false;
  }
}

function officialWatchLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.port) return null;
    // Never forward a stored tracking parameter or an expiring media token.
    url.search = "";
    url.hash = "";
    return officialCrunchyrollWatchURL(url.href);
  } catch {
    return null;
  }
}

/**
 * Sélecteur de « lecteurs » (sources de streaming externes). Les pages officielles
 * Crunchyroll sont des liens sortants ; seuls les vrais lecteurs sont en `<iframe>`.
 * Notre player hls.js ne peut pas consommer ces embeds (pages-lecteur tierces à
 * token éphémère) → on les affiche en iframe.
 *
 * Quand les lecteurs portent un tag de langue (`lang: "vf" | "vostfr"`, posé par
 * `import-voiranime-players-vf.ts`), on affiche un sélecteur **VF / VOSTFR** :
 * l'utilisateur choisit d'abord la langue, puis « Lecteur 1/2/3 » dans cette
 * langue. VF par défaut (audience FR). Sans tag de langue (data legacy), on
 * retombe sur une liste plate « Lecteur N ».
 *
 * Quand la fiche porte des sous-titres et un flux résoluble, un choix
 * « VO sous-titrée » s'ajoute (cf. `LecteurVo`). Il ne l'est jamais par défaut.
 */
export function VideoLecteurs({
  players: rawPlayers,
  entityType,
  entityId,
  vo,
  subtitles,
  title,
  poster,
}: {
  players: Lecteur[];
  /** Entité regardée — sans elle, aucun événement de lecture n'est émis. */
  entityType?: "episode" | "movie";
  entityId?: string | number;
  vo?: LecteurVo;
  subtitles?: SubtitleTrack[];
  title?: string;
  poster?: string;
}) {
  const t = useTranslations("mediaPlayback");
  const ui = useVideoUIText();
  const players = useMemo(() => {
    const seen = new Set<string>();
    return normalizeVideoPlayers(rawPlayers).flatMap((player) => {
      if (!isCrunchyrollHost(player.embedUrl)) return [player];
      const officialURL = officialWatchLink(player.embedUrl);
      if (!officialURL) return [];
      const key = `${player.lang ?? "unknown"}:${officialURL}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ...player, embedUrl: officialURL }];
    });
  }, [rawPlayers]);
  const langLabel = (value: string) => {
    switch (value) {
      case "vf":
        return t("vf");
      case "vostfr":
        return t("vostfr");
      case "vost":
        return t("vost");
      case "vo":
        return t("vo");
      default:
        return t("externalPlayers");
    }
  };
  // Langues réellement présentes, ordonnées VF puis VOSTFR.
  const langs = useMemo(() => {
    return videoLanguages(players);
  }, [players]);
  const hasLangs = langs.length > 0;
  // La VO passe par la variante VOSTFR du proxy HLS. Sans lecteur VOSTFR, le
  // résolveur n'en produit aucune : 5 films portent des sous-titres sans source
  // VOSTFR (mesuré le 2026-09-13) et auraient proposé une option morte. Même
  // règle que resolve-streams.ts, qui déduit les langues des tags des lecteurs.
  const aVo = vo != null && players.some((p) => p.lang === "vostfr");

  const [lang, setLang] = useState<string>(() => resolveVideoSelection(players, ""));
  const selectedLang = resolveVideoSelection(players, lang);
  const [active, setActive] = useState(0);
  const [modeVo, setModeVo] = useState(false);
  const [status, setStatus] = useState<"probing" | "ready" | "failed">("probing");
  // Façade « cliquer pour charger » : tant que le visiteur n'a pas demandé le lecteur
  // externe, aucun `<iframe>`, aucune sonde réseau et aucun cookie tiers ne partent
  // vers l'hébergeur (audit Lighthouse `third-party-cookies`, Bonnes pratiques 58).
  const [armed, setArmed] = useState(false);
  // Le flux VO est résolu à la volée par le bot : il peut être mort. On ne le
  // sonde pas à l'affichage — ce serait une résolution de flux par visite de
  // page —, on le charge au clic et l'on bascule sur un message s'il échoue.
  const [failedVoSource, setFailedVoSource] = useState<string | null>(null);
  const networkFailure = useRef<string | null>(null);
  const [probeAttempt, setProbeAttempt] = useState(0);
  const [useHyperFrames, setUseHyperFrames] = useState(false);

  // Remembered version: applied once after hydration (the server render keeps the default so
  // cached HTML never diverges), and only when this item really offers it.
  const preferenceApplied = useRef(false);
  useEffect(() => {
    if (preferenceApplied.current || langs.length === 0) return;
    preferenceApplied.current = true;
    const preferred = preferredSelection(langs, readVideoLanguagePreference());
    if (preferred && preferred !== lang) {
      setLang(preferred);
      setActive(0);
      setStatus("probing");
    }
  }, [langs, lang]);

  // Derived selection prevents an empty render while the state catches up.
  useEffect(() => {
    if (lang !== selectedLang) {
      setLang(selectedLang);
      setActive(0);
      setStatus("probing");
    }
    if (modeVo && !aVo) setModeVo(false);
  }, [lang, selectedLang, modeVo, aVo]);

  // Untagged sources stay in a separate choice; they never inherit a version.
  const list = useMemo(
    () =>
      hasLangs ? playersForVideoLanguage(players, normalizeVideoLanguage(selectedLang)) : players,
    [players, hasLangs, selectedLang],
  );

  const safeActive = resolvePlayerIndex(active, list.length);
  const current = list[safeActive] ?? list[0];
  const officialURL = current ? officialWatchLink(current.embedUrl) : null;
  const officialPage = officialURL !== null;
  const nativeSource =
    current && isShenronEpisodeVideoURL(new URL(current.embedUrl)) ? current.embedUrl : null;
  const enVo = modeVo && aVo;
  const voEchec = vo != null && failedVoSource === vo.src;

  // Persist the derived index so a later refresh cannot resurrect a removed selection.
  useEffect(() => {
    if (active !== safeActive) setActive(safeActive);
  }, [active, safeActive]);

  // Réinitialise le statut de sonde à chaque changement de lecteur ou de langue
  useEffect(() => {
    if (!enVo && current && !officialPage) {
      setStatus("probing");
    }
  }, [safeActive, current?.embedUrl, enVo, officialPage]);

  // An iframe can emit load for its browser error document after a DNS failure.
  // Check the user's network independently; VPS reachability cannot establish it.
  useEffect(() => {
    if (enVo || !current || officialPage || nativeSource || !armed) return;
    networkFailure.current = null;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    const checkNetwork = async () => {
      const result = await probePlayerNetwork(current.embedUrl, controller.signal);
      if (controller.signal.aborted || result !== "unreachable") return;
      networkFailure.current = current.embedUrl;
      const next = nextPlayerIndex(safeActive, list.length);
      if (next !== null) setActive(next);
      else setStatus("failed");
    };
    void checkNetwork();
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [
    current?.embedUrl,
    enVo,
    officialPage,
    nativeSource,
    safeActive,
    list.length,
    probeAttempt,
    armed,
  ]);

  // Les embeds tiers ne permettent pas toujours un HEAD/CORS fiable. On sonde
  // le lecteur visible uniquement tant qu'il n'a pas confirmé son chargement (ready).
  // Dès que `onLoad` passe le statut à `ready`, ce timer est annulé et ne s'exécute pas.
  useEffect(() => {
    if (enVo || !current || officialPage || nativeSource || status === "ready" || !armed) return;
    const timeout = window.setTimeout(() => {
      const next = nextPlayerIndex(safeActive, list.length);
      if (next !== null) setActive(next);
      else setStatus("failed");
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [safeActive, current, enVo, officialPage, nativeSource, list.length, status, armed]);

  // Choix de version : langues des lecteurs externes (ou « Lecteurs » s'ils ne
  // portent aucun tag), puis la VO quand elle existe.
  const choix = useMemo(() => {
    const externes: string[] = hasLangs ? [...langs] : ["ext"];
    if (hasLangs && players.some((player) => normalizeVideoLanguage(player.lang) === null)) {
      externes.push("ext");
    }
    return aVo ? [...externes, "vo"] : externes;
  }, [hasLangs, langs, aVo, players]);

  /**
   * Ouverture d'un lecteur. C'est LE signal de valeur du site — savoir ce qui
   * est réellement regardé, dans quelle langue et sur quel hébergeur — et le
   * type `play_open` était déclaré depuis le début sans être émis une seule
   * fois. L'hébergeur compte : c'est ce qui permet de repérer un lecteur mort
   * autrement qu'en attendant un signalement (7 hébergeurs sur 8 sont déjà
   * tombés, cf. la purge des lecteurs morts).
   */
  const dejaEmis = useRef<string | null>(null);
  useEffect(() => {
    if (!entityType || entityId == null) return;
    if (enVo) {
      const cle = `${entityId}:vo`;
      if (dejaEmis.current === cle) return;
      dejaEmis.current = cle;
      track("play_open", { entityType, entityId, lang: "vo", player: "hls-vostfr" });
      return;
    }
    if (!current || officialPage) return;
    // Un lecteur externe n'est « ouvert » qu'après le clic sur la façade.
    if (!nativeSource && !armed) return;
    const cle = `${entityId}:${current.embedUrl}`;
    if (dejaEmis.current === cle) return;
    dejaEmis.current = cle;
    track("play_open", {
      entityType,
      entityId,
      lang: normalizeVideoLanguage(current.lang) ?? undefined,
      // `provider` (« vidmoly », « mail.ru ») plutôt que le nom d'affichage :
      // c'est l'hébergeur qui tombe, pas le libellé.
      player: current.provider || current.name || undefined,
    });
  }, [entityType, entityId, current, enVo, officialPage, nativeSource, armed]);
  if (!current) return null;

  const choisir = (c: string) => {
    if (c === "vo") {
      setFailedVoSource(null);
      setModeVo(true);
      return;
    }
    setModeVo(false);
    setLang(c);
    setActive(0);
    const version = normalizeVideoLanguage(c);
    if (version) writeVideoLanguagePreference(version);
  };
  const estChoisi = (c: string) => (c === "vo" ? enVo : !enVo && selectedLang === c);
  const retry = () => {
    networkFailure.current = null;
    setProbeAttempt((attempt) => attempt + 1);
    setActive(0);
    setStatus("probing");
  };

  return (
    <div className="space-y-3">
      {/* Sélecteur de version — visible dès qu'il y a au moins deux choix. */}
      {choix.length > 1 && (
        <div role="group" aria-label={t("versionChoice")} className="shenron-video-selectors">
          {choix.map((c) => (
            <button key={c} type="button" onClick={() => choisir(c)} aria-pressed={estChoisi(c)}>
              {langLabel(c)}
            </button>
          ))}
        </div>
      )}

      {/* Sélecteur de lecteur dans la langue active. */}
      {!enVo && (
        <div role="group" aria-label={t("playerChoice")} className="shenron-video-selectors">
          {list.map((p, i) => (
            <button
              key={`${p.provider}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === safeActive}
              title={`${officialProviderName(p.provider, cleanName(p.name), t("officialPlatform"))} · ${officialProviderName(p.provider, p.provider, t("officialPlatform"))}`}
            >
              {t("playerNumber", { number: i + 1 })}
            </button>
          ))}
        </div>
      )}

      {/* Moteur de lecture: Lecteur Standard vs HyperFrames Remotion */}
      {(enVo || nativeSource) && (
        <div className="flex items-center gap-2 pt-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setUseHyperFrames(false)}
            className={`px-3 py-1 rounded-full border transition-all ${
              !useHyperFrames
                ? "bg-amber-600/20 border-amber-500 text-amber-300"
                : "bg-slate-800/60 border-slate-700 text-slate-400"
            }`}
          >
            Lecteur Standard
          </button>
          <button
            type="button"
            onClick={() => setUseHyperFrames(true)}
            className={`px-3 py-1 rounded-full border transition-all ${
              useHyperFrames
                ? "bg-amber-600/20 border-amber-500 text-amber-300"
                : "bg-slate-800/60 border-slate-700 text-slate-400"
            }`}
          >
            HyperFrames Remotion
          </button>
        </div>
      )}

      {enVo && vo ? (
        voEchec ? (
          <div className="shenron-video flex aspect-video w-full items-center justify-center p-6 text-center text-sm">
            {t("voUnavailable")}
          </div>
        ) : useHyperFrames ? (
          <HyperFramesPlayer
            key={`hf-${vo.src}`}
            src={vo.src}
            title={vo.title}
            poster={vo.poster}
            subtitles={vo.subtitles}
          />
        ) : (
          <VideoPlayer
            key={vo.src}
            src={vo.src}
            title={vo.title}
            poster={vo.poster}
            subtitles={vo.subtitles}
            onError={() => setFailedVoSource(vo.src)}
          />
        )
      ) : nativeSource && status !== "failed" ? (
        useHyperFrames ? (
          <HyperFramesPlayer
            key={`hf-${nativeSource}`}
            src={nativeSource}
            title={title ?? cleanName(current.name)}
            subtitles={subtitles}
            poster={poster}
          />
        ) : (
          <VideoPlayer
            episodeId={entityType === "episode" ? entityId : undefined}
            key={nativeSource}
            src={nativeSource}
            title={title ?? cleanName(current.name)}
            subtitles={subtitles}
            poster={poster}
            onError={() => {
              const next = nextPlayerIndex(safeActive, list.length);
              if (next !== null) setActive(next);
              else setStatus("failed");
            }}
          />
        )
      ) : officialURL ? (
        <div className="shenron-video flex aspect-video w-full flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-sm">{ui("officialProviderNote")}</p>
          <a
            href={officialURL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
          >
            {ui("openOfficialProvider", {
              provider: officialProviderName(
                current.provider,
                current.provider,
                t("officialPlatform"),
              ),
            })}
          </a>
        </div>
      ) : status === "failed" ? (
        <div
          className="shenron-video flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm"
          role="alert"
        >
          <p>{t("playersUnavailable", { count: list.length })}</p>
          <button type="button" onClick={retry} data-primary>
            {t("retry")}
          </button>
        </div>
      ) : !armed ? (
        <div className="shenron-video relative flex aspect-video w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground"
            data-primary
          >
            {t("loadPlayer", { number: safeActive + 1 })}
          </button>
          <p className="max-w-prose text-xs text-muted-foreground">{t("loadPlayerNotice")}</p>
        </div>
      ) : (
        <div className="shenron-video relative aspect-video">
          {/* sandbox : autorise le player tiers (scripts + accès à SA propre
					    origine, requis pour les tokens de flux) mais bloque popups et
					    navigation du top-window → coupe popunders et hijack de l'onglet
					    dragonballfr.com. NE PAS ajouter allow-popups / allow-top-navigation. */}
          <iframe
            className="absolute inset-0 h-full w-full"
            key={current.embedUrl}
            src={current.embedUrl}
            title={t("playerTitle", { number: safeActive + 1, name: cleanName(current.name) })}
            sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="origin"
            loading="lazy"
            onLoad={(event) => {
              const frame = event.currentTarget;
              const bounds = frame.getBoundingClientRect();
              const surface = frame.parentElement?.getBoundingClientRect();
              // A browser can collapse a blocked frame while still firing load.
              if (
                surface &&
                surface.width > 0 &&
                surface.height > 0 &&
                (bounds.width === 0 || bounds.height === 0)
              ) {
                const next = nextPlayerIndex(safeActive, list.length);
                if (next !== null) setActive(next);
                else setStatus("failed");
                return;
              }
              if (networkFailure.current !== current.embedUrl) setStatus("ready");
            }}
            onError={() => {
              const next = nextPlayerIndex(safeActive, list.length);
              if (next !== null) setActive(next);
              else setStatus("failed");
            }}
          />
        </div>
      )}
      {!officialPage && (!nativeSource || enVo) && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {enVo && vo
            ? t("voTracks", { tracks: vo.subtitles.map((track) => track.label).join(", ") })
            : status === "failed"
              ? ui("playerFailed", {
                  version: hasLangs ? `${langLabel(selectedLang)} · ` : "",
                  name: cleanName(current.name),
                })
              : !armed
                ? t("loadPlayerNotice")
                : status === "probing"
                  ? t("probing", {
                      version: hasLangs ? `${langLabel(selectedLang)} · ` : "",
                      name: cleanName(current.name),
                    })
                  : t("selected", {
                      version: hasLangs ? `${langLabel(selectedLang)} · ` : "",
                      name: cleanName(current.name),
                    })}
        </p>
      )}
    </div>
  );
}
