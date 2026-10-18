"use client";

import { useLocale } from "next-intl";
import styles from "./HomeHero.module.css";

/** The official supplied artwork stays unmodified, including its lettering. */
export function HomeBeerusLogo() {
  const locale = useLocale();
  return (
    <img
      src={`/official/beerus/logo-${locale === "ja" ? "ja" : "en"}.webp`}
      alt=""
      aria-hidden="true"
      width={1233}
      height={563}
      className={styles.seriesLogo}
    />
  );
}
