"use client";

/**
 * Raccourcis clavier d'administration, à la GitHub : une touche seule (`/`, `[`,
 * `]`, `n`), jamais pendant la saisie, jamais avec Ctrl ou ⌘ (le shell garde
 * ⌘K), et rien sur un écran tactile puisqu'aucun clavier n'y envoie ces touches.
 */
import { useEffect, useRef } from "react";

export type HotkeyMap = Readonly<Record<string, (event: KeyboardEvent) => void>>;

/** Vrai quand la frappe vise un champ : une lettre tapée dans un formulaire n'est pas un raccourci. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  return Boolean(
    element.closest(
      'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]',
    ),
  );
}

/**
 * Nom canonique d'une frappe : `shift+?` devient `?`, `Escape` reste `Escape`.
 * Les modificateurs Ctrl/⌘/Alt rendent `null` — ces combinaisons appartiennent au
 * navigateur, au shell et à Tauri.
 */
export function hotkeyOf(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

/**
 * Branche `map` sur `document` tant que `enabled` est vrai. La table de
 * raccourcis est relue à chaque frappe : passer un objet littéral ne réabonne
 * pas l'écouteur à chaque rendu.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const latest = useRef(map);
  useEffect(() => {
    latest.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const key = hotkeyOf(event);
      if (!key) return;
      if (key !== "Escape" && isTypingTarget(event.target)) return;
      const handler = latest.current[key];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
