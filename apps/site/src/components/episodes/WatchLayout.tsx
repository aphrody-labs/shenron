import type { ReactNode } from "react";
import { officialWatchArtwork } from "@/lib/official-beerus-artwork";
import styles from "./WatchLayout.module.css";

/** Keeps the viewing stage independent from editorial poster and article columns. */
export function WatchLayout({ children, series }: { children: ReactNode; series?: string | null }) {
  const artwork = officialWatchArtwork(series);
  return (
    <div className={styles.root} data-watch-layout>
      {artwork && (
        <img
          className={styles.artwork}
          src={artwork.src}
          width={artwork.width}
          height={artwork.height}
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="low"
          loading="lazy"
          data-official-artwork={artwork.id}
        />
      )}
      {children}
    </div>
  );
}

export function WatchStage({ children }: { children: ReactNode }) {
  return (
    <div className={styles.stage} data-watch-stage>
      {children}
    </div>
  );
}

export function WatchColumns({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className={styles.columns} data-watch-columns>
      <div className={styles.article}>{children}</div>
      {aside && <aside className={styles.aside}>{aside}</aside>}
    </div>
  );
}
