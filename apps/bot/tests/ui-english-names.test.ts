/**
 * English-identifier guard (decision D3 of `docs/products/bot-discord-refonte.md`): command,
 * group, option and choice-value identifiers are English; French and Japanese live in
 * `nameLocalizations` / `descriptionLocalizations`.
 *
 * The French identifiers that exist today are listed in `fixtures/legacy-command-names.json`.
 * Any French identifier NOT in that file fails this test, so no new French name can be added.
 * The renaming lots (L2-L5) empty the file as they rename: an entry whose identifier no longer
 * exists, or is no longer French, fails too, so the list can only shrink.
 *
 * Identifiers come from the discordx metadata the bot registers with Discord (the `_entries.ts`
 * barrel, then `MetadataStorage.build()`): what the guard checks is what Discord receives.
 */
import "./setup";
import { describe, expect, test } from "bun:test";
import { MetadataStorage } from "discordx";
import legacy from "./fixtures/legacy-command-names.json";

type Kind = "command" | "group" | "subgroup" | "option" | "choice" | "menu";
interface Identifier {
  kind: Kind;
  name: string;
}
type Legacy = Record<`${Kind}s`, readonly string[]>;

/**
 * French words that appear (or could appear) in identifiers, as lowercase ASCII tokens. An
 * identifier is split on `-`, `_` and digits; one token in this set makes it French. Words that
 * are also valid English (`role`, `note`, `race`, `mode`, `type`, `normal`…) are NOT listed.
 */
const FRENCH_TOKENS = new Set(
  (
    "absolu accompli actif adversaire apocryphe assigne attendu attendus bilan catalogue " +
    "categorie cible citations cle commentaire contenu creer derive difficile difficulte discret " +
    "duree echantillon entree eprofil etat facile fiche fixer gagnants inventaire inviteur jour " +
    "jours joueur langue liste membre mise montant morpion niveau nom nombre numero officielle " +
    "ouvrage pendu personnage pfc planche planete priorite prix profil pseudo publier quoi " +
    "raciste raison rang recherche recompense resoudre salon secondes severite solde statut " +
    "succes sujet sujets supervise terme texte titre utilisateur verifier voc voir"
  ).split(" "),
);

/** True when an identifier has an accented letter or a token of the French lexicon. */
export function looksFrench(identifier: string): boolean {
  if (/[À-ɏ]/.test(identifier)) return true;
  return identifier
    .toLowerCase()
    .split(/[^a-z]+/)
    .some((token) => FRENCH_TOKENS.has(token));
}

/** French identifiers that are not exempted by the legacy list. */
export function newFrenchIdentifiers(found: readonly Identifier[], exempt: Legacy): Identifier[] {
  return found.filter((id) => looksFrench(id.name) && !exempt[`${id.kind}s`].includes(id.name));
}

/** Legacy entries that no longer exist, or are no longer French (they must be removed). */
export function staleLegacyEntries(found: readonly Identifier[], exempt: Legacy): Identifier[] {
  const present = new Set(found.map((id) => `${id.kind}:${id.name}`));
  const stale: Identifier[] = [];
  for (const [plural, names] of Object.entries(exempt)) {
    if (!Array.isArray(names)) continue;
    const kind = plural.slice(0, -1) as Kind;
    for (const name of names) {
      if (!present.has(`${kind}:${name}`) || !looksFrench(name)) stale.push({ kind, name });
    }
  }
  return stale;
}

/** Discord name rule for localized command and option names. */
const LOCALIZED_NAME = /^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

async function registeredIdentifiers(): Promise<{
  found: Identifier[];
  localizedNames: Array<{ where: string; locale: string; name: string }>;
}> {
  await import("~/_entries");
  const storage = MetadataStorage.instance;
  await storage.build();
  const found = new Map<string, Identifier>();
  const localizedNames: Array<{ where: string; locale: string; name: string }> = [];
  const add = (kind: Kind, name: unknown) => {
    if (typeof name === "string" && name.length > 0) found.set(`${kind}:${name}`, { kind, name });
  };
  const localized = (where: string, map: Record<string, string | null> | null | undefined) => {
    for (const [locale, name] of Object.entries(map ?? {})) {
      if (typeof name === "string") localizedNames.push({ where, locale, name });
    }
  };

  for (const command of storage.applicationCommandSlashesFlat) {
    add("command", command.name);
    if (command.group) add("group", command.group);
    if (command.subgroup) add("subgroup", command.subgroup);
    localized(`/${command.name}`, command.nameLocalizations);
    for (const option of command.options) {
      add("option", option.name);
      localized(`/${command.name} ${option.name}`, option.nameLocalizations);
      for (const choice of (option as { choices?: Array<{ value: unknown }> }).choices ?? []) {
        add("choice", choice.value);
      }
    }
  }
  for (const group of storage.applicationCommandSlashGroups) add("group", group.name);
  for (const group of storage.applicationCommandSlashSubGroups) add("subgroup", group.name);
  for (const menu of [...storage.applicationCommandUsers, ...storage.applicationCommandMessages]) {
    add("menu", menu.name);
  }
  return { found: [...found.values()], localizedNames };
}

const label = (ids: readonly Identifier[]) => ids.map((id) => `${id.kind} "${id.name}"`).toSorted();

describe("English identifiers for commands, groups, options and choices", () => {
  test("no new French identifier: only the legacy list may be French", async () => {
    const { found } = await registeredIdentifiers();
    expect(found.length).toBeGreaterThan(100);
    expect(
      label(newFrenchIdentifiers(found, legacy as Legacy)),
      "rename with an English identifier and put the French text in nameLocalizations; " +
        "never add to fixtures/legacy-command-names.json",
    ).toEqual([]);
  });

  test("the legacy list only shrinks: every entry still exists and is still French", async () => {
    const { found } = await registeredIdentifiers();
    expect(
      label(staleLegacyEntries(found, legacy as Legacy)),
      "renamed: remove the entry from fixtures/legacy-command-names.json",
    ).toEqual([]);
  });

  test("the legacy list is sorted and has no duplicates (clean diffs when it shrinks)", () => {
    for (const [plural, names] of Object.entries(legacy)) {
      if (!Array.isArray(names)) continue;
      expect(names, plural).toEqual([...new Set(names)].toSorted());
    }
  });

  test("localized names (nameLocalizations) follow the Discord name rule", async () => {
    const { localizedNames } = await registeredIdentifiers();
    for (const { where, locale, name } of localizedNames) {
      expect(LOCALIZED_NAME.test(name), `${where} [${locale}] "${name}"`).toBe(true);
      expect(name, `${where} [${locale}] must be lowercase`).toBe(name.toLowerCase());
    }
  });
});

describe("the detector itself", () => {
  const empty: Legacy = {
    commands: [],
    groups: [],
    subgroups: [],
    options: [],
    choices: [],
    menus: [],
  };

  test("French identifiers are caught, English ones pass", () => {
    for (const french of [
      "solde",
      "planete",
      "membre",
      "mise",
      "purge-jours",
      "session_cible",
      "CANON_ABSOLU",
      "résoudre",
      "énergie",
    ]) {
      expect(looksFrench(french), french).toBe(true);
    }
    for (const english of [
      "wallet",
      "planet",
      "member",
      "stake",
      "profile",
      "help",
      "role",
      "note",
      "race",
      "mode",
      "type",
      "normal",
      "fusion",
      "level-reward-set",
      "xp-boost-list",
      "inspect-rag",
      "p0",
      "fr",
      "en",
    ]) {
      expect(looksFrench(english), english).toBe(false);
    }
  });

  test("a new French command, option or choice fails; an exempted or English one does not", () => {
    const found: Identifier[] = [
      { kind: "command", name: "solde" },
      { kind: "command", name: "wallet" },
      { kind: "option", name: "adversaire" },
      { kind: "choice", name: "facile" } as Identifier,
    ];
    expect(label(newFrenchIdentifiers(found, empty))).toEqual([
      'choice "facile"',
      'command "solde"',
      'option "adversaire"',
    ]);
    const exempt = { ...empty, commands: ["solde"], options: ["adversaire"], choices: ["facile"] };
    expect(newFrenchIdentifiers(found, exempt)).toEqual([]);
    // The exemption is per kind: a French *option* named like an exempt command still fails.
    expect(label(newFrenchIdentifiers([{ kind: "option", name: "solde" }], exempt))).toEqual([
      'option "solde"',
    ]);
  });

  test("an entry that was renamed (or never was French) is reported as stale", () => {
    const found: Identifier[] = [{ kind: "command", name: "wallet" }];
    const exempt = { ...empty, commands: ["solde", "wallet"] };
    expect(label(staleLegacyEntries(found, exempt))).toEqual([
      'command "solde"',
      'command "wallet"',
    ]);
  });
});
