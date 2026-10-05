import type { ReactNode } from "react";
import type { BreadcrumbList, WithContext } from "schema-dts";
import { ShellTrail } from "@shenron/ui/navigation/AppShell";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL } from "@/lib/config";
import { isPathPublic } from "@/lib/wiki-launch";
import { getLaunchConfig } from "@/lib/wiki-launch-config";

/**
 * Fil d'Ariane — UI **et** `BreadcrumbList` JSON-LD dans le même composant.
 *
 * Les deux vont ensemble par construction : Google n'affiche le fil d'Ariane
 * dans ses résultats que si le balisage décrit un chemin réellement présent sur
 * la page. Les avoir séparés (ce qui était le cas : 3 pages balisées, zéro fil
 * visible nulle part) garantissait de perdre le rich result et de laisser
 * l'utilisateur sans repère de profondeur dans une arborescence à 4 niveaux.
 *
 * « Accueil » est ajouté d'office : `items` ne décrit que le chemin SOUS la
 * racine. Le dernier élément est la page courante — il n'est jamais un lien
 * (règle schema.org ET bon sens UX : on ne se lie pas à soi-même).
 *
 * Le fil VISIBLE est confié au shell (`ShellTrail`) : la barre du haut l'affiche en entier
 * sur desktop et en fait un bouton « retour » vers le maillon parent sur mobile. Une page
 * n'a donc jamais deux fils superposés ; hors shell, il se rend en place.
 */
/**
 * `label` est la chaîne de RÉFÉRENCE : elle part dans le `BreadcrumbList`
 * JSON-LD, qui s'indexe et ne se traduit donc pas côté client. `display` est ce
 * que le lecteur voit — un `<T>` quand le maillon a une clé de dictionnaire.
 */
export type Crumb = { label: string; display?: ReactNode; href?: string };

export async function Breadcrumbs({
  items,
  className = "",
}: {
  items: Crumb[];
  /** Classes du `<nav>` (marges). */
  className?: string;
}) {
  // Un maillon qui pointe une rubrique refermée depuis /admin/launch est une
  // impasse — et, balisé en `BreadcrumbList`, une impasse **annoncée à Google**.
  // On garde le maillon (le chemin reste lisible) mais on retire sa cible : il
  // devient un simple repère, exactement comme la page courante.
  const cfg = await getLaunchConfig().catch(() => null);
  const brut: Crumb[] = [{ label: "Accueil", href: "/" }, ...items];
  const trail: Crumb[] = brut.map((c) =>
    c.href && cfg && !isPathPublic(c.href, cfg) ? { label: c.label } : c,
  );

  const schema: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem" as const,
      position: i + 1,
      name: c.label,
      // `item` seulement quand il y a une cible : un ListItem final sans URL
      // est la forme recommandée pour la page courante.
      ...(c.href ? { item: `${SITE_URL}${c.href}` } : {}),
    })),
  };

  return (
    <>
      <JsonLd data={schema} />
      <ShellTrail
        items={trail.map((c) => ({ label: c.display ?? c.label, href: c.href }))}
        label="Fil d'Ariane"
        className={className}
      />
    </>
  );
}
