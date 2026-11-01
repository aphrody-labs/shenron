"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { allowsPublicAds, needsAdvertisingReset } from "@/lib/public-ads";
import { useAdsEligibility } from "@/lib/ads-eligibility";

export function PublicAdsScript({ client }: { client: string }) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const eligible = useAdsEligibility(pathname);

  useEffect(() => {
    // Third-party scripts keep running after SPA navigation. A fresh document
    // removes the public advertising CMP before entering a staff workspace.
    if (needsAdvertisingReset(previousPath.current, pathname)) window.location.reload();
    previousPath.current = pathname;
  }, [pathname]);

  if (!allowsPublicAds(pathname) || !eligible) return null;
  return (
    <Script
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
