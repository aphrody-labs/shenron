"use client";

// SPDX-License-Identifier: Apache-2.0
import { Captions } from "lucide-react";
import { useTranslations } from "next-intl";
import { VideoSelect } from "./VideoSelect";
import type { VideoTextTrack } from "./use-video-text-tracks";
import styles from "./VideoTrackControls.module.css";

interface CaptionProps {
  textTracks: VideoTextTrack[];
  caption: number;
}

/** A single-click CC toggle keeps language selection in the shared settings menu. */
export function VideoCaptionToggle({
  textTracks,
  caption,
  onToggle,
}: CaptionProps & { onToggle: () => void }) {
  const t = useTranslations("mediaPlayback");
  if (!textTracks.length) return null;
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={t("captions")}
      aria-pressed={caption !== -1}
      title={`${t("captions")} · ${textTracks.find((track) => track.index === caption)?.label ?? t("captionsOff")} (C)`}
      onClick={onToggle}
    >
      <Captions size={22} aria-hidden="true" />
    </button>
  );
}

export function VideoTrackSettings({
  textTracks,
  caption,
  onCaptionChange,
  audioTracks,
  audioTrack,
  onAudioChange,
}: CaptionProps & {
  onCaptionChange: (index: number) => void;
  audioTracks: { index: number; name?: string }[];
  audioTrack: number;
  onAudioChange: (index: number) => void;
}) {
  const t = useTranslations("mediaPlayback");
  return (
    <>
      {audioTracks.length > 0 && (
        <div className={styles.row}>
          <span>{t("audioTrack")}</span>
          {audioTracks.length === 1 ? (
            <span>{audioTracks[0]?.name || t("audioTrackNumber", { number: 1 })}</span>
          ) : (
            <VideoSelect
              cinema
              aria-label={t("audioTrack")}
              value={audioTrack}
              onChange={(event) => {
                const index = Number(event.target.value);
                if (index !== audioTrack) onAudioChange(index);
              }}
            >
              {audioTracks.map((track) => (
                <option key={track.index} value={track.index}>
                  {track.name || t("audioTrackNumber", { number: track.index + 1 })}
                </option>
              ))}
            </VideoSelect>
          )}
        </div>
      )}
      {textTracks.length > 0 && (
        <div className={styles.row}>
          <span>{t("captions")}</span>
          <VideoSelect
            cinema
            aria-label={t("captions")}
            value={caption}
            onChange={(event) => {
              const index = Number(event.target.value);
              if (index !== caption) onCaptionChange(index);
            }}
          >
            <option value={-1}>{t("captionsOff")}</option>
            {textTracks.map((track) => (
              <option key={track.index} value={track.index}>
                {track.label}
              </option>
            ))}
          </VideoSelect>
        </div>
      )}
    </>
  );
}
