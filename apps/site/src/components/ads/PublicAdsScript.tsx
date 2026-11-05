"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { allowsPublicAds, needsAdvertisingReset } from "@/lib/public-ads";
import { useAdsEligibility } from "@/lib/ads-eligibility";
import { afterInteractionOrIdle } from "@/lib/deferred-third-party";

export function PublicAdsScript({ client }: { client: string }) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const eligible = useAdsEligibility(pathname);
  const allowed = allowsPublicAds(pathname) && eligible;

  useEffect(() => {
    // Third-party scripts keep running after SPA navigation. A fresh document
    // removes the public advertising CMP before entering a staff workspace.
    if (needsAdvertisingReset(previousPath.current, pathname)) window.location.reload();
    previousPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    // AdSense (et son CMP certifié) ne charge qu'après la première interaction
    // ou au repos : ~250 Kio de JS hors du chemin critique, TBT allégé.
    void afterInteractionOrIdle().then(() => {
      if (cancelled) return;
      const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, client]);

  return null;
}
