"use client";

import { useLocale } from "next-intl";
import { optimizedSrc, optimizedSrcSet } from "@/lib/images";
import styles from "./HomeHero.module.css";

/** The official supplied artwork stays unmodified, including its lettering. */
export function HomeBeerusLogo() {
  const locale = useLocale();
  const src = `/official/beerus/logo-${locale === "ja" ? "ja" : "en"}.webp`;
  return (
    <img
      src={optimizedSrc(src, 384)}
      srcSet={optimizedSrcSet(src, [256, 384, 640])}
      sizes="17rem"
      alt=""
      aria-hidden="true"
      width={1233}
      height={563}
      decoding="async"
      className={styles.seriesLogo}
    />
  );
}
