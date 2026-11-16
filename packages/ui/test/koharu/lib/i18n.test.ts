import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const values = new Map<string, string>();
const storage: Storage = {
  get length() {
    return values.size;
  },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => values.delete(key),
  setItem: (key, value) => values.set(key, value),
};

// bun:test has no vi.resetModules: load a fresh copy of the module through a query-busted URL.
let load = 0;
const freshI18n = () =>
  import(
    `${Bun.resolveSync("@shenron/ui/koharu/lib/i18n", import.meta.dir)}?load=${++load}`
  ) as Promise<typeof import("@shenron/ui/koharu/lib/i18n")>;

describe("interface language persistence", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("stores an explicitly selected language", async () => {
    const { default: i18n } = await freshI18n();

    await i18n.changeLanguage("ja-JP");

    expect(window.localStorage.getItem("i18nextLng")).toBe("ja-JP");
  });

  it("restores the saved language when i18n initializes", async () => {
    window.localStorage.setItem("i18nextLng", "ja-JP");

    const { default: i18n } = await freshI18n();

    expect(i18n.resolvedLanguage).toBe("ja-JP");
    expect(window.localStorage.getItem("i18nextLng")).toBe("ja-JP");
  });

  it("falls back to French when no detected language is one the editor speaks", async () => {
    const languages = Object.getOwnPropertyDescriptor(navigator, "languages");
    const language = Object.getOwnPropertyDescriptor(navigator, "language");
    Object.defineProperty(navigator, "languages", { configurable: true, value: ["de-DE"] });
    Object.defineProperty(navigator, "language", { configurable: true, value: "de-DE" });
    try {
      for (const stale of ["ko-KR", "zh-TW", "es-ES", "de-DE"]) {
        window.localStorage.setItem("i18nextLng", stale);
        const { default: i18n } = await freshI18n();
        expect(i18n.resolvedLanguage, stale).toBe("fr-FR");
      }
    } finally {
      if (languages) Object.defineProperty(navigator, "languages", languages);
      else Reflect.deleteProperty(navigator, "languages");
      if (language) Object.defineProperty(navigator, "language", language);
      else Reflect.deleteProperty(navigator, "language");
    }
  });

  it("maps a regional or bare browser language to the editor language of its site locale", async () => {
    for (const [stored, expected] of [
      ["en-GB", "en-US"],
      ["ja", "ja-JP"],
      ["fr-CA", "fr-FR"],
    ] as const) {
      window.localStorage.setItem("i18nextLng", stored);
      const { default: i18n } = await freshI18n();
      expect(i18n.resolvedLanguage, stored).toBe(expected);
    }
  });
});
