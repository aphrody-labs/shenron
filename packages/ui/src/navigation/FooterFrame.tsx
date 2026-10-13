import type { ReactNode } from "react";

export function FooterFrame({ children }: { children: ReactNode }) {
  return (
    <footer
      data-shell-footer
      className="relative mt-auto bg-[var(--card)] text-[var(--card-foreground)] border-t border-[var(--border)]"
    >
      {children}
    </footer>
  );
}
