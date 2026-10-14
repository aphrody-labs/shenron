import { useId, type SVGProps } from "react";
import { WORDMARK_VIEWBOX, renderWordmarkArtwork } from "../toriyama-svg/wordmark";

export interface DragonBallWordmarkProps extends SVGProps<SVGSVGElement> {
  decorative?: boolean;
  title?: string;
}

export function DragonBallWordmark({
  decorative = false,
  title = "Dragon Ball France",
  ...props
}: DragonBallWordmarkProps) {
  const id = `dragon-wordmark-${useId().replace(/:/g, "")}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={WORDMARK_VIEWBOX}
      focusable="false"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-labelledby={decorative ? undefined : `${id}-title`}
      {...props}
    >
      {!decorative && <title id={`${id}-title`}>{title}</title>}
      {/* This string contains only our measured paths, canonical cloud and generated IDs. */}
      <g dangerouslySetInnerHTML={{ __html: renderWordmarkArtwork(id) }} />
    </svg>
  );
}
