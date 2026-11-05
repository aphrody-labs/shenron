"use client";

import { useEffect } from "react";
import { afterInteractionOrIdle } from "@/lib/deferred-third-party";

type GtmWindow = Window & { dataLayer?: unknown[] };

/**
 * Google Tag Manager chargé après la première interaction ou au repos, au lieu de
 * `@next/third-parties` qui l'injecte dès l'hydratation. Même amorçage que le
 * snippet officiel (`gtm.start` puis `gtm.js`) ; le `dataLayer` et les valeurs
 * par défaut du Consent Mode v2 (`denied`) sont déjà posés dans `<head>`.
 */
export function DeferredGoogleTagManager({ gtmId }: { gtmId: string }) {
  useEffect(() => {
    let cancelled = false;
    void afterInteractionOrIdle().then(() => {
      if (cancelled) return;
      const w = window as GtmWindow;
      const id = encodeURIComponent(gtmId);
      if (document.querySelector(`script[src*="googletagmanager.com/gtm.js?id=${id}"]`)) return;
      w.dataLayer ??= [];
      w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
      document.head.appendChild(script);
    });
    return () => {
      cancelled = true;
    };
  }, [gtmId]);
  return null;
}
