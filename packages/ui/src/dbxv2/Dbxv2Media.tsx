"use client";

/* oxlint-disable jsx-a11y/media-has-caption -- reviewed: admin-only private tooling, behavior preserved */
/** Dbxv2Audio and Dbxv2Video — native controls over a signed URL, with an announced error + retry. */
import { useState } from "react";
import { useDbxv2Labels } from "./context";

interface MediaProps {
  src: string;
  /** Accessible name of the player. */
  label: string;
  className?: string;
}

function useRetry() {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return {
    failed,
    attempt,
    fail: () => setFailed(true),
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    },
  };
}

function MediaError({ onRetry }: { onRetry: () => void }) {
  const labels = useDbxv2Labels();
  return (
    <div role="alert" className="dbxv2-media__state">
      <span>{labels.error}</span>
      <button type="button" onClick={onRetry}>
        {labels.retry}
      </button>
    </div>
  );
}

export function Dbxv2Audio({ src, label, className = "" }: MediaProps) {
  const labels = useDbxv2Labels();
  const { failed, attempt, fail, retry } = useRetry();
  return (
    <div className={`dbxv2-media ${className}`}>
      {failed ? (
        <MediaError onRetry={retry} />
      ) : (
        <audio key={attempt} controls preload="none" src={src} aria-label={label} onError={fail}>
          {labels.audioUnsupported}
        </audio>
      )}
    </div>
  );
}

export function Dbxv2Video({ src, label, className = "" }: MediaProps) {
  const labels = useDbxv2Labels();
  const { failed, attempt, fail, retry } = useRetry();
  return (
    <div className={`dbxv2-media ${className}`}>
      {failed ? (
        <MediaError onRetry={retry} />
      ) : (
        <video
          key={attempt}
          controls
          preload="metadata"
          playsInline
          src={src}
          aria-label={label}
          onError={fail}
        >
          {labels.videoUnsupported}
        </video>
      )}
    </div>
  );
}
