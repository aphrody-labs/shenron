/**
 * DragonBall — la boule de cristal en SVG pur (0 JS, server-safe).
 *
 * Refaite d'après la MESURE d'une vraie boule, et non plus d'après le dessin
 * svgrepo #484265 qui la précédait : celui-ci portait une sphère ambre pâle en
 * aplat (`#F5BF41`), une ombre portée, un glint blanc lustré et une étoile de
 * 0,25 rayon — quatre traits qu'on ne trouve sur aucune impression du support.
 *
 * ## La source
 *
 * `assets/ext/db_manga_volumes/82.jpg` — couverture du **tome 1 original**,
 * 1000 × 1500, où la boule tient la place du O de « DRAGON » et mesure 100 px
 * de diamètre, soit 10 % de la largeur de page. C'est la plus grande boule
 * disponible en propre dans le dépôt, et la seule assez définie pour qu'on y
 * lise un dégradé plutôt qu'un aplat.
 *
 * Le cercle est ajusté par CORDES : pour chaque ligne, le plus long segment qui
 * n'est ni le jaune de la lettre, ni le noir du cerne, ni le blanc du papier.
 * Les milieux de corde tombent à x = 444,5 ± 1 sur 100 lignes, et le modèle
 * `corde = 2·√(R² − dy²)` colle à moins de 3 px avec R = 50.
 *
 * ## Ce qui est mesuré
 *
 * | Grandeur | Mesure | Note |
 * |---|---|---|
 * | Disque | centre (444,5 ; 165,8), Ø 100 px | 10 % de la largeur de page |
 * | Foyer du dégradé | **(−0,30 ; −0,39) R** | en HAUT À GAUCHE, à 0,49 R du centre |
 * | Dégradé | 10 arrêts, `#FDFFEA` au foyer → `#EF9A2B` au bord | ambre chaud, jamais rouge |
 * | Bord | ~`#F29D32` sur les 8 directions | le pourtour est sombre TOUT AUTOUR |
 * | Étoile, rayon externe | **0,412 R** | 360 rayons, moyenne des 40 plus longs |
 * | Étoile, rayon interne | **0,479 Ro** | moyenne des 40 plus courts, même seuil |
 * | Étoile, position | (+0,02 ; +0,015) R | concentrique à 1 px près |
 * | Étoile, orientation | pointes à 54°, 126°, 198°, 270°, 342° | pointe en haut |
 * | Rouge de l'étoile | **`#E81F23`** | médiane sur 758 px (second relevé `#EA1E24`) |
 * | Cerne d'encre | **aucun** sur cette couverture | le disque est posé nu sur le jaune |
 *
 * ## Les deux écarts assumés
 *
 * 1. **Le cerne est conservé**, à 4,5 % du diamètre — valeur mesurée, elle, sur
 *    la boule du logo de `db_manga_volumes/124.jpg` (Dragon Ball Super), qui en
 *    porte un de 4 px pour Ø 89. Sur le papier la boule est posée sur du jaune
 *    et se détache seule ; sur le fond noir du site, sans cerne, elle flotte en
 *    découpe. C'est la même raison qui a fait doubler le cerne des titres.
 * 2. **Le rayon interne de l'étoile est arrondi à 0,45**, la valeur que le
 *    design system porte déjà pour `<Etoile>` et pour la boule de la couverture
 *    DBS. Trois lectures : 0,45, 0,45, 0,479 — l'écart tient dans la bavure
 *    d'encre, et une seule géométrie d'étoile dans le code vaut mieux que trois.
 *
 * Le dégradé est conservé COMME dégradé : c'est, avec la pastille de numéro de
 * tome, le seul endroit du support qui n'est pas un aplat franc
 * (cf. `docs/reference/couverture-analyse-visuelle.md`).
 */

import {
	SPHERE_DEGRADE,
	SPHERE_ENCRE,
	SPHERE_FOYER,
	SPHERE_R_EXT,
	SPHERE_R_INT,
	SPHERE_ROUGE_ETOILE,
	etoilesSphere,
	nombreEtoiles,
	type DragonBallStars,
} from "../toriyama-svg/sphere";

export type { DragonBallStars };

export function DragonBall({
	stars = 4,
	size = 64,
	className,
	title,
	decorative = false,
}: {
	stars?: number;
	size?: number;
	className?: string;
	title?: string;
	/**
	 * Décor pur : la boule sort de l'arbre d'accessibilité.
	 *
	 * `KintoUn` et `DragonBallLoader` portaient déjà cet interrupteur, pas elle —
	 * si bien qu'une boule posée pour le décor s'annonçait quand même. Les sept
	 * boules dispersées de la page 404 se lisaient « Dragon Ball à 1 étoile,
	 * Dragon Ball à 2 étoiles… », sept fois, avant le seul texte utile de la
	 * page ; et le loader annonçait « Chargement » PUIS le nom de sa propre
	 * illustration.
	 */
	decorative?: boolean;
}) {
	const n = nombreEtoiles(stars);
	const a11y = decorative
		? { "aria-hidden": true as const }
		: { role: "img" as const, "aria-label": title ?? `Dragon Ball à ${n} étoile${n > 1 ? "s" : ""}` };
	// Identifiant DÉTERMINISTE, pas un compteur de module ni un `useId` : le
	// composant est rendu côté serveur sans état, et deux boules de même nombre
	// d'étoiles partagent alors une définition strictement identique — la
	// collision d'id est sans effet, là où un compteur casserait l'hydratation.
	const gid = `db-sphere-${n}`;

	return (
		<svg
			viewBox="0 0 512 512"
			width={size}
			height={size}
			className={className}
			{...a11y}
		>
			<defs>
				{/* `userSpaceOnUse` et non `objectBoundingBox` : le dégradé appartient
				    au disque INTÉRIEUR (r = 233), pas à la boîte englobante, qui
				    contient en plus le cerne. */}
				<radialGradient
					id={gid}
					gradientUnits="userSpaceOnUse"
					cx={SPHERE_R_EXT}
					cy={SPHERE_R_EXT}
					r={SPHERE_R_INT}
					fx={SPHERE_FOYER.x}
					fy={SPHERE_FOYER.y}
				>
					{SPHERE_DEGRADE.map(([offset, couleur]) => (
						<stop key={offset} offset={offset} stopColor={couleur} />
					))}
				</radialGradient>
			</defs>
			{/* Cerne d'encre : un disque noir plein, le dégradé par-dessus. Un
			    `stroke` centré sur le cercle déborderait du viewBox. */}
			<circle cx={SPHERE_R_EXT} cy={SPHERE_R_EXT} r={SPHERE_R_EXT} fill={SPHERE_ENCRE} />
			<circle cx={SPHERE_R_EXT} cy={SPHERE_R_EXT} r={SPHERE_R_INT} fill={`url(#${gid})`} />
			{/* Étoiles rouges (1 à 7), aplat franc sans contour — la couverture n'en
			    pose aucun autour d'elles. */}
			{etoilesSphere(n).map((points, i) => (
				<polygon key={i} points={points} fill={SPHERE_ROUGE_ETOILE} />
			))}
		</svg>
	);
}

/**
 * Loader animé : une Dragon Ball qui tourne (état de chargement).
 *
 * Par défaut c'est une région live (`role="status"` + `aria-label`) : à réserver
 * aux chargements autonomes (page/section). Dans un contrôle déjà nommé (bouton
 * « Chercher », champ de recherche), passer `decorative` → le loader devient
 * `aria-hidden` et n'usurpe plus le nom accessible du contrôle.
 */
export function DragonBallLoader({
	size = 40,
	stars = 4,
	className = "",
	decorative = false,
}: {
	size?: number;
	stars?: DragonBallStars;
	className?: string;
	decorative?: boolean;
}) {
	return (
		<span
			className={`inline-block ${className}`}
			style={{ width: size, height: size, animation: "db-spin 1.1s linear infinite" }}
			{...(decorative ? { "aria-hidden": true } : { "aria-label": "Chargement", role: "status" })}
		>
			{/* `decorative` : l'enveloppe porte déjà « Chargement » (ou est masquée) —
			    sans cela, le lecteur d'écran enchaînait avec le nom de l'illustration.
			    Même parti pris que `KintoUnLoader`. */}
			<DragonBall stars={stars} size={size} decorative />
			<style>{`@keyframes db-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.inline-block[style*="db-spin"]{animation:none!important}}`}</style>
		</span>
	);
}
