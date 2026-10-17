/**
 * SenzuBean — Senzu bean, drawn from the measured geometry of `toriyama-svg/senzu`
 * (colour edition, cf. `docs/reference/senzu-analyse-visuelle.md`): ellipse,
 * straight hilum, two flat tones and ink, tilted like the bean in Goku's palm.
 */

import { useId, type SVGProps } from "react";
import { corpsIcone } from "../toriyama-svg/senzu";

export interface SenzuBeanProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  size?: number | string;
  title?: string;
  decorative?: boolean;
}

export function SenzuBean({
  size = 40,
  className = "",
  title,
  decorative = false,
  ...props
}: SenzuBeanProps) {
  const id = `senzu-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { defs, dessin } = corpsIcone(512, 0.88, id);
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": title ?? "Senzu (Haricot Magique)" };

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={`inline-block select-none ${className}`}
      {...a11y}
      {...props}
      dangerouslySetInnerHTML={{ __html: `<defs>${defs}</defs>${dessin}` }}
    />
  );
}
