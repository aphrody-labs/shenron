/**
 * TabNav — la barre d'onglets **en liens**, pas en état client.
 *
 * Un onglet qui ne change que du `useState` ne se partage pas, ne s'indexe pas,
 * et repart à zéro au retour arrière. Ici chaque onglet est une URL réelle
 * (`/news/fil/articles`), donc : partageable, crawlable, cacheable par le CDN, et le
 * bouton « retour » du navigateur fait ce que le lecteur attend.
 *
 * Sur mobile la barre défile horizontalement sans couper le dernier onglet
 * (`snap` + gouttière négative pour que le premier onglet reste aligné au bord
 * du shell).
 *
 * Server component.
 */
import type { ComponentType, ReactNode } from "react";

export type TabLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-current"?: "page";
};

export interface TabItem {
  href: string;
  label: string;
  /** Compteur affiché en exposant (facultatif). */
  count?: number | null;
}

const nf = new Intl.NumberFormat("fr-FR");

export function TabNav({
  items,
  active,
  ariaLabel = "Onglets",
  className = "",
  linkComponent: LinkComponent = "a",
}: {
  items: readonly TabItem[];
  /** `href` de l'onglet courant. */
  active: string;
  ariaLabel?: string;
  className?: string;
  linkComponent?: ComponentType<TabLinkProps> | "a";
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`-mx-[var(--shell-pad,1.5rem)] overflow-x-auto px-[var(--shell-pad,1.5rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <ul className="flex min-w-max snap-x items-center gap-2">
        {items.map((item) => {
          const current = item.href === active;
          return (
            <li key={item.href} className="snap-start">
              <LinkComponent
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={[
                  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-display text-[0.875rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere",
                  current
                    ? "border-dbz-green bg-dbz-green/25 text-os"
                    : "border-os/15 text-os/75 hover:border-os/40 hover:text-os",
                ].join(" ")}
              >
                {item.label}
                {typeof item.count === "number" && (
                  <span className={current ? "tabular-nums text-os/70" : "tabular-nums text-os/45"}>
                    {nf.format(item.count)}
                  </span>
                )}
              </LinkComponent>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
