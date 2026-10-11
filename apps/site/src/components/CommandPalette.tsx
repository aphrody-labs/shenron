"use client";

import { CommandPalette as SharedCommandPalette } from "@aphrody/shenron-ui/public/CommandPalette";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { assetUrl } from "@/lib/assets";
import { track } from "@/lib/telemetry";

const recordSearch = (query: string, resultCount: number) =>
  track("search", { query, resultCount });

export default function CommandPalette(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  return (
    <SharedCommandPalette
      {...props}
      locale={useLocale()}
      navigate={router.push}
      resolveAsset={assetUrl}
      onSearch={recordSearch}
    />
  );
}
