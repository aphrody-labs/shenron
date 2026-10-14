import { useId, type SVGProps } from "react";
import {
  WORDMARK_COLORS,
  WORDMARK_CLOUD_TRANSFORM,
  WORDMARK_FRANCE_GLYPHS,
  WORDMARK_FRANCE_RIBBON,
  WORDMARK_FRANCE_TRANSFORM,
  WORDMARK_LETTERS,
  WORDMARK_LIGHTNING,
  WORDMARK_VIEWBOX,
  renderWordmarkCloud,
} from "../toriyama-svg/wordmark";

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
      aria-labelledby={decorative ? undefined : id}
      {...props}
    >
      {!decorative && <title id={id}>{title}</title>}
      <g stroke={WORDMARK_COLORS.ink} strokeWidth={3.2} strokeLinejoin="round" fillRule="evenodd">
        {WORDMARK_LETTERS.map((letter) => (
          <path key={letter.d} fill={WORDMARK_COLORS[letter.fill]} d={letter.d} />
        ))}
        <path d={WORDMARK_LIGHTNING} fill={WORDMARK_COLORS.yellow} strokeWidth={4} />
      </g>
      <g
        transform={WORDMARK_CLOUD_TRANSFORM}
        dangerouslySetInnerHTML={{ __html: renderWordmarkCloud(`${id}-cloud`) }}
      />
      <path
        d={WORDMARK_FRANCE_RIBBON}
        fill={WORDMARK_COLORS.yellow}
        stroke={WORDMARK_COLORS.ink}
        strokeWidth={2.5}
      />
      <g transform={WORDMARK_FRANCE_TRANSFORM} fill={WORDMARK_COLORS.ink} fillRule="evenodd">
        {WORDMARK_FRANCE_GLYPHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
