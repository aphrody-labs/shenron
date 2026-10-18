"use client";
/* oxlint-disable jsx-a11y/media-has-caption -- a wordless sound effect is identified by its explicit play/stop button */

import { useEffect, useRef, useState } from "react";
import { createTranslator, useLocale } from "next-intl";
import { Volume2, VolumeX } from "lucide-react";
import fr from "../../../messages/home-media-ui/fr.json";
import en from "../../../messages/home-media-ui/en.json";
import ja from "../../../messages/home-media-ui/ja.json";
import styles from "./HomeHero.module.css";

/** A recorded cue requires a deliberate press; no synthesis substitutes for missing audio. */
export function HomeSoundCue() {
  const requested = useLocale();
  const locale = requested === "en" || requested === "ja" ? requested : "fr";
  const t = createTranslator({ locale, messages: { fr, en, ja }[locale] });
  const sound = useRef<HTMLAudioElement>(null);
  const mounted = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const audio = sound.current;
    const stop = () => {
      audio?.pause();
      if (audio) audio.currentTime = 0;
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) stop();
    });
    const hero = audio?.closest("header");
    if (hero) observer.observe(hero);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
      stop();
    };
  }, []);
  return (
    <>
      <button
        type="button"
        aria-label={t(playing ? "stop" : "play")}
        aria-pressed={playing}
        onClick={() => {
          const audio = sound.current;
          if (!audio) return;
          setFailed(false);
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
            return;
          }
          audio.volume = 0.18;
          void audio.play().catch(() => {
            if (!mounted.current || document.hidden) return;
            setFailed(true);
            setPlaying(false);
          });
        }}
      >
        {playing ? (
          <VolumeX size={19} aria-hidden="true" />
        ) : (
          <Volume2 size={19} aria-hidden="true" />
        )}
      </button>
      <audio
        ref={sound}
        src="/sfx/nimbus.mp3"
        preload="none"
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
      />
      {failed && <output className={styles.soundError}>{t("failed")}</output>}
    </>
  );
}
