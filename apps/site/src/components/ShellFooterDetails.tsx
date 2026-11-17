"use client";
import type { ReactNode } from "react";
import { useShellUIText } from "@/lib/shell-ui-text";
import { ChevronBas } from "@aphrody/shenron-ui/icones";

export function ShellFooterDetails({ children }: { children: ReactNode }) {
  const t = useShellUIText();
  return (
    <details className="shenron-footer-details" data-compact="true">
      <summary className="page-shell">
        <ChevronBas size={18} />
        {t("footerDetails")}
      </summary>
      {children}
    </details>
  );
}
