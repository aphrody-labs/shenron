"use client";

import { useEffect } from "react";
import { getConsent, onConsentChange } from "@/lib/consent";
import { afterInteractionOrIdle } from "@/lib/deferred-third-party";

type GtmWindow = Window & { dataLayer?: unknown[] };

function injectGtm(gtmId: string): void {
  const w = window as GtmWindow;
  const id = encodeURIComponent(gtmId);
  if (document.querySelector(`script[src*="googletagmanager.com/gtm.js?id=${id}"]`)) return;
  w.dataLayer ??= [];
  w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
  document.head.appendChild(script);
}

/**
 * Google Tag Manager chargé UNIQUEMENT après consentement à la mesure d'audience
 * (`analytics: true`, y compris relayé par le CMP certifié), puis après la
 * première interaction ou au repos. Aucun `<link rel="preload">` ni `<script>`
 * n'est émis avant le choix : `@next/third-parties` préchargeait gtm.js dès
 * l'hydratation. Le Consent Mode v2 (`denied` par défaut, posé dans `<head>`)
 * reçoit ensuite le `consent update` de `lib/consent`.
 */
export function DeferredGoogleTagManager({ gtmId }: { gtmId: string }) {
  useEffect(() => {
    let cancelled = false;
    let started = false;
    const start = () => {
      if (started || cancelled) return;
      started = true;
      void afterInteractionOrIdle().then(() => {
        if (!cancelled) injectGtm(gtmId);
        return undefined;
      });
    };
    if (getConsent().analytics) start();
    const off = onConsentChange((state) => {
      if (state.analytics) start();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [gtmId]);
  return null;
}
