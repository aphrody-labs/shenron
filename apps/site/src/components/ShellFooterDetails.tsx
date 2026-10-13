"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useShellUIText } from "@/lib/shell-ui-text";
import { ChevronBas } from "@aphrody/shenron-ui/icones";

export function ShellFooterDetails({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(true);
  const t = useShellUIText();
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const sync = () => {
      const standalone =
        media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setCompact(standalone);
      setOpen(!standalone);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return (
    <details
      className="shenron-footer-details"
      data-compact={compact}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="page-shell">
        <ChevronBas size={18} />
        {t("footerDetails")}
      </summary>
      {children}
    </details>
  );
}
