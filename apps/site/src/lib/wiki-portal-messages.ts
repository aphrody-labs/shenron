// SPDX-License-Identifier: Apache-2.0
import fr from "../../messages/wiki-portal/fr.json";
import en from "../../messages/wiki-portal/en.json";
import ja from "../../messages/wiki-portal/ja.json";
export type PortalUiKey = keyof typeof fr;
export function portalUiMessages(locale: string) {
  const messages = { fr, en, ja }[locale as "fr" | "en" | "ja"] ?? fr;
  return (key: PortalUiKey, values?: Record<string, string | number>) =>
    messages[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
      values && name in values ? String(values[name]) : whole,
    );
}
