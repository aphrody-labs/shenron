/**
 * Catégories unifiées des databooks / interviews / art books / guides.
 * Source unique pour la grille publique, le studio (ENUM_OPTIONS) et le schéma.
 *
 * Un seul champ éditorial (`category`) — plus de dualité kind/category en UI.
 * La colonne `kind` reste en base (NOT NULL, index legacy) et est dérivée
 * automatiquement de la catégorie à l'écriture.
 */
export const DATABOOK_CATEGORIES = [
	"Databook",
	"Interview",
	"Art Book",
	"Saikyō Jump",
	"V-Jump",
	"Weekly Shonen Jump",
	"Pamphlet & Fair",
	"Autre",
] as const;

export type DatabookCategory = (typeof DATABOOK_CATEGORIES)[number];


export type DatabookKind = "databook" | "interview" | "artbook" | "guidebook";

export function resolveDatabookCategory(c: string | null | undefined): DatabookCategory {
	const t = (c ?? "").trim();
	// Alias historique : la catégorie s'appelait « Guidebook » avant d'être
	// renommée en « Saikyō Jump » (elle ne contient que ce magazine).
	if (t === "Guidebook") return "Saikyō Jump";
	if ((DATABOOK_CATEGORIES as readonly string[]).includes(t)) {
		return t as DatabookCategory;
	}
	return "Autre";
}

/**
 * Dérive la colonne technique `kind` depuis la catégorie unifiée.
 * Les catégories éditoriales (V-Jump, …) restent rattachées à `databook`.
 */
export function kindFromCategory(c: string | null | undefined): DatabookKind {
	switch (resolveDatabookCategory(c)) {
		case "Interview":
			return "interview";
		case "Art Book":
			return "artbook";
		case "Saikyō Jump":
			return "guidebook";
		default:
			return "databook";
	}
}

