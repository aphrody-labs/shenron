import type { CSSProperties, ReactNode } from "react";
import type { HomeScene } from "@aphrody/shenron-config/home";

/** Editorial sections use the configured site surface and era atmosphere without background video playback. */
export function SectionScene({
  scene,
  className = "",
  children,
}: {
  scene?: HomeScene;
  className?: string;
  children: ReactNode;
}) {
  const style = scene?.accent ? ({ "--scene-accent": scene.accent } as CSSProperties) : undefined;

  return (
    <div
      data-scene-era={scene?.era}
      data-scene-id={scene?.id}
      style={style}
      className={`home-section-scene relative min-w-0 rounded-xl border border-border bg-card ${className}`}
    >
      <div aria-hidden="true" className="home-section-backdrop" />
      <div className="home-section-inner p-4 sm:p-6">{children}</div>
    </div>
  );
}
