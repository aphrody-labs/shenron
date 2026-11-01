"use client";

import { useLangue } from "@/lib/i18n/client";
import {
  getWikiPortalMessages,
  getWikiReaderMessages,
  type WikiLocale,
  type WikiPortalKey,
  type WikiReaderKey,
} from "@/lib/wiki-character-version-messages";
import fr from "../../../messages/wiki-public/fr.json";
import en from "../../../messages/wiki-public/en.json";
import ja from "../../../messages/wiki-public/ja.json";

const dictionaries = { fr, en, ja };

export {
  getWikiPortalMessages,
  getWikiReaderMessages,
  type WikiLocale,
  type WikiPortalKey,
  type WikiReaderKey,
};
type PowerKey = keyof typeof fr.powerScaling;
export type SoundtrackKey = keyof typeof fr.soundtracks;

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export function useWikiPortalText() {
  const { locale } = useLangue();
  return getWikiPortalMessages(locale);
}

export function useWikiReaderText() {
  const { locale } = useLangue();
  return getWikiReaderMessages(locale);
}

export function WikiPortalText({
  k,
  values,
}: {
  k: WikiPortalKey;
  values?: Record<string, string | number>;
}) {
  const text = useWikiPortalText();
  return <>{text(k, values)}</>;
}

export function WikiReaderText({
  k,
  values,
}: {
  k: WikiReaderKey;
  values?: Record<string, string | number>;
}) {
  const text = useWikiReaderText();
  return <>{text(k, values)}</>;
}

export function useWikiPowerText() {
  const { locale } = useLangue();
  const messages = dictionaries[locale].powerScaling;
  return (key: PowerKey, values?: Record<string, string | number>) =>
    interpolate(messages[key], values);
}

export function WikiPowerText({
  k,
  values,
}: {
  k: PowerKey;
  values?: Record<string, string | number>;
}) {
  const text = useWikiPowerText();
  return <>{text(k, values)}</>;
}

export function WikiPowerNumber({ value }: { value: number }) {
  const { locale } = useLangue();
  const numberLocale = locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "fr-FR";
  return <>{value.toLocaleString(numberLocale)}</>;
}

export function useWikiSoundtrackText() {
  const { locale } = useLangue();
  const messages = dictionaries[locale].soundtracks;
  return (key: SoundtrackKey) => messages[key];
}
