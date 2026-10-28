"use client";

import { useEffect, useState } from "react";
import { allowsPublicAds } from "@/lib/public-ads";
import { usePathname } from "next/navigation";

interface AdSenseSlotProps {
  slot: string;
  client?: string;
  format?: "auto" | "rectangle" | "horizontal" | "vertical";
  responsive?: boolean;
  className?: string;
  label?: string;
}

export function AdSenseSlot({
  slot,
  client = "ca-pub-XXXXXXXXXX",
  format = "auto",
  responsive = true,
  className = "",
  label = "Sponsor DBFR",
}: AdSenseSlotProps) {
  const pathname = usePathname();
  const [isVip, setIsVip] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Vérification du statut VIP dans le cookie ou l'état local
    const vipCookie = document.cookie.split("; ").find((row) => row.startsWith("dbfr_vip="));
    if (vipCookie && vipCookie.split("=")[1] === "true") {
      setIsVip(true);
    }
  }, []);

  if (!mounted) return null;
  if (isVip || !allowsPublicAds(pathname)) return null;

  return (
    <div
      className={`my-6 flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-amber-500/20 bg-amber-950/10 p-3 backdrop-blur-xs transition-all hover:border-amber-500/40 ${className}`}
    >
      <div className="mb-2 flex w-full items-center justify-between px-2 text-[10px] tracking-wider text-amber-400/60 uppercase">
        <span className="flex items-center gap-1 font-semibold">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          {label}
        </span>
        <a
          href="/vip"
          className="rounded px-1.5 py-0.5 text-amber-300 transition-colors hover:bg-amber-500/20 hover:text-amber-200"
        >
          Supprimer les pubs avec le VIP ⚡
        </a>
      </div>

      <div className="min-h-[90px] w-full flex items-center justify-center">
        <ins
          className="adsbygoogle"
          style={{ display: "block", textAlign: "center" }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive={responsive ? "true" : "false"}
        />
      </div>
    </div>
  );
}
