import type { ReactNode } from "react";
import type { HomeScene } from "@/lib/home-scenes";

/** Editorial sections use the configured site surface without background playback. */
export function SectionScene({
  className = "",
  children,
}: {
  scene?: HomeScene;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`home-section-scene relative min-w-0 rounded-xl border border-border bg-card ${className}`}
    >
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}
