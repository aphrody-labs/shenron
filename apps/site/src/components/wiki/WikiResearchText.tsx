"use client";
import { useLangue } from "@/lib/i18n/client";
import fr from "../../../messages/wiki-research/fr.json";
import en from "../../../messages/wiki-research/en.json";
import ja from "../../../messages/wiki-research/ja.json";
import styles from "./wiki-research.module.css";
const dictionaries = { fr, en, ja };
export function WikiResearchText({
  name,
  group,
  values,
}: {
  name?: Exclude<keyof typeof fr, "groups">;
  group?: keyof typeof fr.groups;
  values?: Record<string, string | number>;
}) {
  const { locale } = useLangue();
  const dictionary = dictionaries[locale] ?? fr;
  const text = group ? dictionary.groups[group] : name ? dictionary[name] : "";
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    values && key in values ? String(values[key]) : whole,
  );
}
export function WikiResearchForm({ query }: { query: string }) {
  const { locale } = useLangue();
  const text = dictionaries[locale] ?? fr;
  return (
    <search className={styles.search}>
      <form action="/wiki/search" method="get">
        <label htmlFor="wiki-research-query">{text.query}</label>
        <div className={styles.inputRow}>
          <input
            id="wiki-research-query"
            name="q"
            type="search"
            minLength={2}
            maxLength={200}
            defaultValue={query}
            placeholder={text.placeholder}
            required
          />
          <button type="submit">{text.submit}</button>
        </div>
      </form>
    </search>
  );
}
