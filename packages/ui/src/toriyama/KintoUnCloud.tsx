/**
 * KintoUnCloud — le Kinto-Un à taille libre (largeur × hauteur), sur la géométrie
 * MESURÉE de `toriyama-svg/kinto-un` (cf. `docs/reference/kinto-un-analyse-visuelle.md`).
 *
 * Il portait jusqu'ici sa propre silhouette — sept points annoncés « mesurés »
 * sans source, deux volutes posées à la main et une ombre découpée par un
 * `clip-path: polygon()` CSS au lieu de la silhouette. Il délègue désormais au
 * même corps que `<KintoUn>`, les SVG de `assets/dbz/` et les favicons : une
 * seule géométrie pour tout le nuage.
 */

import type { SVGProps } from "react";
import { KINTO_UN_ILLUSTRATION, corpsNuage } from "../toriyama-svg/kinto-un";

export interface KintoUnCloudProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
	width?: number | string;
	height?: number | string;
	animated?: boolean;
	title?: string;
	decorative?: boolean;
}

export function KintoUnCloud({
	width = 120,
	height = 68,
	animated = false,
	className = "",
	title,
	decorative = false,
	style,
	...props
}: KintoUnCloudProps) {
	const n = KINTO_UN_ILLUSTRATION;
	const a11y = decorative
		? { "aria-hidden": true as const }
		: { role: "img" as const, "aria-label": title ?? "Kinto-Un, le nuage magique" };

	return (
		<svg
			viewBox={`0 0 ${n.largeur} ${n.hauteur}`}
			width={width}
			height={height}
			className={`inline-block select-none ${animated ? "animate-bounce motion-reduce:animate-none" : ""} ${className}`}
			style={animated ? { animationDuration: "2.4s", ...style } : style}
			{...a11y}
			{...props}
			// Préfixe d'ids propre (`ktc-*`) : il ne vole pas le `clipPath` d'un
			// `<KintoUn>` (`kt-*`) posé sur la même page. Corps généré par notre
			// code, sans donnée externe.
			dangerouslySetInnerHTML={{ __html: corpsNuage(n, "ktc") }}
		/>
	);
}
