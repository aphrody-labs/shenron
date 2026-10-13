import type { ReactNode } from "react";

export function MobileNavFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <nav
      aria-label={label}
      data-shell-mobile-nav
      className="barre-nav fixed inset-x-0 bottom-0 z-[55] border-t-2 border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-[0_-4px_20px_rgba(0,0,0,0.15)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
    >
      {children}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
