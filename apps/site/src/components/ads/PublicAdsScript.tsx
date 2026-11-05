"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { allowsPublicAds, needsAdvertisingReset } from "@/lib/public-ads";
import { useAdsEligibility } from "@/lib/ads-eligibility";
import { afterInteractionOrIdle } from "@/lib/deferred-third-party";
import { getConsent, onConsentChange } from "@/lib/consent";

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
    let started = false;
    const loadScript = () => {
      if (cancelled) return;
      const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      if (document.querySelector(`script[src="${src}"]`)) return;
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    };
    // Meme consentement `dbfr_consent` que GTM : aucune requete vers les hotes
    // publicitaires Google tant que le visiteur n'a pas accepte. Sans accord,
    // les emplacements `AdUnit` reservent leur hauteur puis se replient (aucun
    // script charge). Apres accord, AdSense (et son CMP certifie) demarre a la
    // premiere interaction ou au repos.
    const start = () => {
      if (started || cancelled) return;
      started = true;
      void afterInteractionOrIdle().then(loadScript);
    };
    if (getConsent().analytics) start();
    const off = onConsentChange((state) => {
      if (state.analytics) start();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [allowed, client]);

  return null;
}
