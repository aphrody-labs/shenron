// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LOCALES_INFO, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n";
import { useLangue } from "@/lib/i18n/client";
import { ChevronBas } from "@aphrody/shenron-ui/icones";

/**
 * Le code affiché dans le bouton. `ja` se dit « JP » pour un lecteur français,
 * mais l'attribut de langue reste `ja` : c'est la norme, pas le drapeau.
 *
 * Les drapeaux ont disparu : un drapeau n'est pas une langue (le français n'est
 * pas la France), et surtout le bouton affichait « 🇫🇷 FR » — la même
 * information deux fois, ce que l'œil lit comme « FR FR ».
 */
const CODE_AFFICHE = (code: SupportedLocale) => (code === "ja" ? "JP" : code.toUpperCase());

export function LanguageSwitcher({
  variant = "default",
  drop = "down",
}: {
  variant?: "default" | "compact";
  /** `up` for the last line of the page: a panel below it would fall off. */
  drop?: "down" | "up";
}) {
  const [open, setOpen] = useState(false);
  const { locale, dico, changerLangue: appliquer } = useLangue();
  const ref = useRef<HTMLDivElement | null>(null);
  const boutonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // Le panneau disparaît avec l'élément qui portait le focus : sans ce
      // retour sur le déclencheur, le focus repart de `<body>`.
      if (ref.current?.contains(document.activeElement)) boutonRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const changerLangue = (code: SupportedLocale) => {
    setOpen(false);
    boutonRef.current?.focus();
    if (code === locale) return;
    // Aucun rechargement de page : les libellés d'interface viennent du
    // contexte, ils basculent au rendu suivant. Repartir du serveur ne changeait
    // rien de plus — il rend toujours le même HTML — et faisait perdre sa place
    // au lecteur.
    appliquer(code);
  };

  const current = LOCALES_INFO[locale];

  return (
    <div ref={ref} className="relative select-none shenron-language">
      <button
        ref={boutonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${dico.common.language} : ${current.nativeName}`}
        className={`shenron-language-trigger ${variant === "compact" ? "is-compact" : ""}`}
      >
        <span className="font-mono text-xs font-black uppercase tracking-wider">
          {CODE_AFFICHE(current.code)}
        </span>
        {variant === "default" && (
          <ChevronBas
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          id={menuId}
          className={`shenron-language-panel absolute right-0 z-50 ${
            drop === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="px-3 py-1.5 text-xs font-bold text-os/60">{dico.common.language}</div>
          <ul className="flex flex-col gap-0.5">
            {SUPPORTED_LOCALES.map((code) => {
              const info = LOCALES_INFO[code];
              const isCurrent = code === locale;
              return (
                <li key={code}>
                  <button
                    type="button"
                    onClick={() => changerLangue(code)}
                    // La langue active n'était signalée que par la couleur : au
                    // lecteur d'écran, les trois entrées se lisaient à
                    // l'identique. `aria-current` la nomme sans rien changer au
                    // dessin (même parti pris que le groupe d'interlocuteurs de
                    // l'assistant flottant).
                    aria-current={isCurrent ? "true" : undefined}
                    className="shenron-language-option"
                  >
                    <span lang={code}>{info.nativeName}</span>
                    <span className="font-mono text-xs font-bold uppercase tracking-wider opacity-70">
                      {CODE_AFFICHE(code)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Dire ce qui change vraiment. Le site a une doctrine : ne jamais
					    présenter comme traduit ce qui ne l'est pas. */}
          <p className="mt-1 border-t border-os/15 px-3 py-2 text-xs leading-relaxed text-os/65">
            {dico.common.uiOnly}
          </p>
        </div>
      )}
    </div>
  );
}
