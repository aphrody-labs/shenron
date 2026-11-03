// SPDX-License-Identifier: Apache-2.0
import sphere from "@aphrody/shenron-ui/assets/wiki-objects/dragon-ball-one-star.svg";
import senzu from "@aphrody/shenron-ui/assets/wiki-objects/senzu-icon.svg";
import styles from "./wiki-measured-artwork.module.css";

/** A small measured illustration supplements a label without describing official artwork. */
export function WikiMeasuredArtwork({ subject }: { subject: "sphere" | "senzu" }) {
  // Next emits static image metadata; Bun's source-level SSR tests return a file URL.
  const artwork = (subject === "sphere" ? sphere : senzu) as string | { src: string };
  const src = typeof artwork === "string" ? artwork : artwork.src;
  return (
    <img
      src={src}
      width={32}
      height={32}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={styles.artwork}
      data-measured-illustration="decorative"
    />
  );
}
