"use client";

// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";

const preferenceKey = "shenron:video:captions";
type Preference = "off" | { language: string; label: string };
export interface VideoTextTrack {
  index: number;
  label: string;
}

function readPreference(): Preference | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
    if (value === "off") return value;
    if (
      value &&
      typeof value === "object" &&
      "language" in value &&
      typeof value.language === "string" &&
      "label" in value &&
      typeof value.label === "string"
    )
      return { language: value.language, label: value.label };
  } catch {
    // Captions remain usable when browser storage is unavailable.
  }
  return null;
}

function isCaption(track: TextTrack) {
  return track.kind === "subtitles" || track.kind === "captions";
}

/** React observes the browser's tracks, including in-band HLS captions. */
export function useVideoTextTracks(videoRef: RefObject<HTMLVideoElement | null>, source: string) {
  const t = useTranslations("mediaPlayback");
  const [textTracks, setTextTracks] = useState<VideoTextTrack[]>([]);
  const [caption, setCaption] = useState(-1);
  const lastCaption = useRef<{ language: string; label: string } | null>(null);
  const preferenceRef = useRef<Preference | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const tracks = video?.textTracks;
    if (!tracks || !video) return;
    preferenceRef.current = readPreference();
    const sync = () => {
      const list = Array.from(tracks);
      setTextTracks(
        list.flatMap((track, index) =>
          isCaption(track)
            ? [
                {
                  index,
                  label: track.label || track.language || t("captionNumber", { number: index + 1 }),
                },
              ]
            : [],
        ),
      );
      setCaption(list.findIndex((track) => isCaption(track) && track.mode === "showing"));
    };
    const restore = () => {
      const list = Array.from(tracks);
      const preference = preferenceRef.current;
      if (preference) {
        const preferred =
          preference === "off"
            ? -1
            : list.findIndex(
                (track) =>
                  isCaption(track) &&
                  track.language === preference.language &&
                  track.label === preference.label,
              );
        // A different edition is not silently selected when the saved variant is absent.
        if (preference === "off" || preferred !== -1) {
          list.forEach((track, index) => {
            if (isCaption(track)) track.mode = index === preferred ? "showing" : "disabled";
          });
          if (preference !== "off") lastCaption.current = preference;
        }
      }
      sync();
    };
    restore();
    tracks.addEventListener("addtrack", restore);
    tracks.addEventListener("removetrack", restore);
    tracks.addEventListener("change", sync);
    video.addEventListener("loadedmetadata", restore);
    return () => {
      tracks.removeEventListener("addtrack", restore);
      tracks.removeEventListener("removetrack", restore);
      tracks.removeEventListener("change", sync);
      video.removeEventListener("loadedmetadata", restore);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new source reloads tracks on the same video element.
  }, [source, t, videoRef]);

  const selectCaption = useCallback(
    (index: number) => {
      const tracks = videoRef.current?.textTracks;
      if (!tracks || !Number.isInteger(index) || index < -1 || index >= tracks.length) return;
      const selected = index === -1 ? null : tracks[index];
      if (selected && !isCaption(selected)) return;
      Array.from(tracks).forEach((track, current) => {
        if (isCaption(track)) track.mode = current === index ? "showing" : "disabled";
      });
      if (selected) lastCaption.current = { language: selected.language, label: selected.label };
      preferenceRef.current = selected ? lastCaption.current : "off";
      setCaption(index);
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(preferenceRef.current));
      } catch {
        // The current selection must work without persistence.
      }
    },
    [videoRef],
  );

  const toggleCaptions = () => {
    if (caption !== -1) {
      selectCaption(-1);
      return;
    }
    const preferred = Array.from(videoRef.current?.textTracks ?? []).findIndex(
      (track) =>
        isCaption(track) &&
        track.language === lastCaption.current?.language &&
        track.label === lastCaption.current?.label,
    );
    if (preferred !== -1) selectCaption(preferred);
    else if (textTracks[0]) selectCaption(textTracks[0].index);
  };

  return { textTracks, caption, selectCaption, toggleCaptions };
}
