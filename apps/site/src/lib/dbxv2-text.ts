/**
 * Labels of the private DBXV2 admin tools. They live in their own dictionaries
 * (`messages/dbxv2/{fr,en,ja}.json`), never in the public ones, so no private label can reach the
 * public client bundle. Imported only by the DBXV2 staff surface.
 */
import fr from "../../messages/dbxv2/fr.json";
import en from "../../messages/dbxv2/en.json";
import ja from "../../messages/dbxv2/ja.json";

export type Dbxv2Text = typeof fr;
export type Dbxv2Locale = "fr" | "en" | "ja";

const DICTIONARIES: Record<Dbxv2Locale, Dbxv2Text> = { fr, en, ja };

export function dbxv2Locale(value: string | undefined | null): Dbxv2Locale {
  const code = value?.toLowerCase().slice(0, 2);
  return code === "en" || code === "ja" ? code : "fr";
}

export function dbxv2Text(locale: string | undefined | null): Dbxv2Text {
  return DICTIONARIES[dbxv2Locale(locale)];
}
