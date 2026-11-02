import { expect, test } from "bun:test";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import ja from "../messages/ja.json";
import { VIE_EMPTY, VIE_EMPTY_KINDS } from "../src/lib/vie-empty";

const dicts = { fr, en, ja } as const;

test("every illustrated empty state has translated text and at least one exit", () => {
  for (const [lang, d] of Object.entries(dicts)) {
    for (const kind of VIE_EMPTY_KINDS) {
      const entry = (d.vie.empty as Record<string, { title: string; description: string }>)[kind];
      expect(entry?.title, `${lang}.${kind}.title`).toBeTruthy();
      expect(entry?.description, `${lang}.${kind}.description`).toBeTruthy();
      const def = VIE_EMPTY[kind];
      expect(def.actions.length).toBeGreaterThan(0);
      for (const a of def.actions) {
        expect((d.vie.cta as Record<string, string>)[a.cta], `${lang}.cta.${a.cta}`).toBeTruthy();
      }
    }
  }
});

test("the 404 strings exist in the three languages", () => {
  for (const d of Object.values(dicts)) {
    for (const k of ["sector", "line1", "line2", "home", "manga"] as const) {
      expect(d.vie.notFound[k]).toBeTruthy();
    }
  }
});

test("external exits are absolute, internal ones are paths", () => {
  for (const kind of VIE_EMPTY_KINDS) {
    for (const a of VIE_EMPTY[kind].actions) {
      if (a.external) expect(a.href).toMatch(/^https:\/\//);
      else expect(a.href.startsWith("/")).toBe(true);
    }
  }
});
