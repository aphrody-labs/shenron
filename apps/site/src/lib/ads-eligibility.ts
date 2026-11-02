"use client";

import { useEffect, useState } from "react";

const CACHE_MS = 15_000;
let cached: { expiresAt: number; request: Promise<boolean> } | null = null;

function checkAdsEligibility(): Promise<boolean> {
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetch("/api/ads/eligibility", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) return false;
      const body: unknown = await response.json();
      return Boolean(
        body && typeof body === "object" && "adsAllowed" in body && body.adsAllowed === true,
      );
    })
    .catch(() => false);
  cached = { expiresAt: Date.now() + CACHE_MS, request };
  return request;
}

export function useAdsEligibility(pathname: string | null): boolean {
  const [result, setResult] = useState<{ pathname: string; allowed: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    if (!pathname)
      return () => {
        active = false;
      };
    void checkAdsEligibility().then((allowed) => {
      if (active) setResult({ pathname, allowed });
      return allowed;
    });
    return () => {
      active = false;
    };
  }, [pathname]);
  return result?.pathname === pathname && result.allowed;
}
