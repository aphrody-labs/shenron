import "./setup-training";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseService } from "../src/db/index";
import { EventBusService } from "../src/services/EventBusService";
import { SettingsService, findSettingDef } from "../src/services/SettingsService";
import { AdminReportGoalService, escapeMdCell } from "../src/services/AdminReportGoalService";
import { CanonService } from "../src/services/CanonService";
import { TrainingService } from "../src/services/TrainingService";
import { EMBED_LIMITS, errorText, shenronEmbed, truncate } from "../src/lib/embeds";
import { validateTriggerRegex } from "../src/commands/admin/Achievements";
import { adjustedXp } from "../src/commands/admin/LevelAdmin";
import { settingSuggestions, settingLine } from "../src/commands/admin/Config";
import { CATEGORIES, OTHER_CATEGORY, commandsOfCategory } from "../src/commands/admin/Help";
import { chunk } from "../src/commands/admin/Ids";
import { canonTierColor, isHttpUrl } from "../src/commands/admin/Train";
import { evalSampleSize, parseTitleAndDescription } from "../src/events/AdminLabListener";
import { boundedLimit } from "../src/api/service-registry";
import { levelForXP, xpRequiredForLevel } from "../src/lib/xp";

const workDir = mkdtempSync(join(tmpdir(), "admin-core-test-"));
// Migrated test database of setup-training (DATABASE_PATH in a temporary directory).
const dbs = new DatabaseService();
afterAll(() => {
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // Windows may still hold a handle on a file of the directory.
  }
});

describe("lib/embeds — style partagé", () => {
  test("shenronEmbed pose l'en-tête de marque, le pied commun et borne les textes", () => {
    const json = shenronEmbed({
      header: "TEST",
      title: "x".repeat(400),
      description: "y".repeat(5000),
    }).toJSON();
    expect(json.author?.name).toBe("SHENRON · TEST");
    expect(json.author?.icon_url).toContain("dragonballfr.com");
    expect(json.footer?.text).toBe("Shenron · dragonballfr.com");
    expect(json.title?.length).toBe(EMBED_LIMITS.title);
    expect(json.description?.length).toBe(EMBED_LIMITS.description);
  });

  test("footer: false retire le pied ; truncate ne coupe que si nécessaire", () => {
    expect(shenronEmbed({ title: "a", footer: false }).toJSON().footer).toBeUndefined();
    expect(truncate("court", 10)).toBe("court");
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
  });

  test("errorText lit Error, chaîne et valeur inconnue", () => {
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText("raté")).toBe("raté");
    expect(errorText(42)).toBe("Erreur inconnue");
  });
});

describe("SettingsService — validation stricte", () => {
  const settings = new SettingsService(dbs, new EventBusService());

  test("un entier suivi de texte est refusé (parseInt l'acceptait)", async () => {
    await expect(settings.set("xp.message.min", "12abc")).rejects.toThrow("entier");
    await settings.set("xp.message.min", " 12 ");
    expect(await settings.getRaw("xp.message.min")).toBe("12");
  });

  test("un décimal invalide ou vide est refusé", async () => {
    await expect(settings.set("xp.voice.muted_ratio", "0.5x")).rejects.toThrow("nombre");
    await expect(settings.set("xp.voice.muted_ratio", "")).rejects.toThrow("nombre");
  });

  test("findSettingDef résout une clé exacte puis une collection préfixée", () => {
    expect(findSettingDef("channel.level")?.key).toBe("channel.level");
    expect(findSettingDef("xp.boost.role.123456789012345678")?.prefix).toBe(true);
    expect(findSettingDef("inconnue.cle")).toBeUndefined();
  });
});

describe("/config — autocomplétion et rendu", () => {
  test("toutes les clés sont atteignables, pas seulement les 25 premières", () => {
    const hit = settingSuggestions("canon.daily_hour");
    expect(hit[0]?.value).toBe("canon.daily_hour");
    expect(settingSuggestions("").length).toBe(25);
    expect(settingSuggestions("salon des annonces").some((s) => s.value === "channel.announce"));
    for (const s of settingSuggestions("xp")) expect(s.name.length).toBeLessThanOrEqual(100);
  });

  test("une surcharge de salon s'affiche en mention", () => {
    const def = findSettingDef("channel.level")!;
    expect(settingLine(def, "123456789012345678")).toContain("<#123456789012345678>");
    expect(settingLine(def, undefined)).toStartWith("▫️");
  });
});

describe("/succes — regex des triggers", () => {
  test("refuse g et y (RegExp.test devient stateful) et les doublons", () => {
    expect(validateTriggerRegex("kame", "g")).toContain("Flags invalides");
    expect(validateTriggerRegex("kame", "iy")).toContain("Flags invalides");
    expect(validateTriggerRegex("kame", "ii")).toContain("Flags invalides");
    expect(validateTriggerRegex("kame", undefined)).toBeNull();
    expect(validateTriggerRegex("(", "i")).not.toBeNull();
  });
});

describe("/niveau — calcul d'XP", () => {
  test("exp ajoute ou retire sans passer sous zéro", () => {
    expect(adjustedXp(100, "exp", 1, 50)).toBe(150);
    expect(adjustedXp(10, "exp", -1, 50)).toBe(0);
  });

  test("niveau saute au seuil du niveau cible de la courbe active", () => {
    const xp = xpRequiredForLevel(3);
    expect(levelForXP(adjustedXp(xp, "niveau", 1, 2))).toBe(5);
    expect(adjustedXp(xp, "niveau", -1, 10)).toBe(0);
  });
});

describe("/help — catégories", () => {
  const cmds = [
    { name: "profil", group: undefined },
    { name: "stats", group: "voc" }, // sous-commande : ne doit pas tomber dans « profil »
    { name: "list", group: "config" },
    { name: "nouvelle", group: undefined },
    { name: "secret", group: undefined },
  ];
  const staff = new Set(["config", "secret"]);
  const cat = (key: string) => CATEGORIES.find((c) => c.key === key)!;

  test("une sous-commande suit son groupe, pas son nom", () => {
    const profil = commandsOfCategory(cat("profil"), cmds, staff, true).map((c) => c.name);
    expect(profil).toEqual(["profil"]);
    const tickets = commandsOfCategory(cat("tickets"), cmds, staff, true).map((c) => c.name);
    expect(tickets).toEqual(["stats"]);
  });

  test("les commandes non classées publiques vont dans « Autres », les staff dans l'admin", () => {
    const other = commandsOfCategory(cat(OTHER_CATEGORY), cmds, staff, false).map((c) => c.name);
    expect(other).toEqual(["nouvelle"]);
    const admin = commandsOfCategory(cat("admin"), cmds, staff, true).map((c) => c.name);
    expect(admin).toEqual(["list", "secret"]);
    expect(commandsOfCategory(cat("admin"), cmds, staff, false)).toEqual([]);
  });
});

describe("/ids — découpage", () => {
  test("aucun morceau vide ni au-delà de la limite", () => {
    const text = ["a".repeat(30), "b".repeat(5), "c".repeat(30)].join("\n");
    const parts = chunk(text, 20);
    expect(parts.every((p) => p.length > 0 && p.length <= 20)).toBe(true);
  });
});

describe("/train et lab — helpers", () => {
  test("couleur de rang canon et URL d'image", () => {
    expect(canonTierColor("CANON_ABSOLU")).toBe(0x22c55e);
    expect(canonTierColor("APOCRYPHE_FANON")).toBe(0xef4444);
    expect(typeof canonTierColor("inconnu")).toBe("number");
    expect(isHttpUrl("https://google.com/a.png")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("pas une url")).toBe(false);
  });

  test("!eval borne l'échantillon, !goal exige un titre", () => {
    expect(evalSampleSize("")).toBe(25);
    expect(evalSampleSize("-4")).toBe(25);
    expect(evalSampleSize("10")).toBe(10);
    expect(evalSampleSize("99999")).toBe(500);
    expect(parseTitleAndDescription("| sans titre")).toBeNull();
    expect(parseTitleAndDescription("Titre | a | b")).toEqual({
      title: "Titre",
      description: "a | b",
    });
    expect(parseTitleAndDescription("Seul")).toEqual({ title: "Seul", description: "Seul" });
  });

  test("boundedLimit borne les recherches du registre de services", () => {
    expect(boundedLimit(undefined)).toBe(25);
    expect(boundedLimit(10_000)).toBe(100);
    expect(boundedLimit(0)).toBe(1);
    expect(boundedLimit(Number.NaN)).toBe(25);
  });
});

describe("AdminReportGoalService — filtres et Markdown", () => {
  const service = AdminReportGoalService.create(dbs, {
    docsDir: join(workDir, "docs"),
    notify: async () => {},
  });

  test("le filtre « open » inclut les signalements en cours", async () => {
    const rep = await service.createReport({
      userId: "1",
      category: "bot",
      title: "En cours | avec pipe",
      description: "ligne 1\nligne 2",
    });
    dbs.sqlite.query("UPDATE admin_reports SET status = 'in_progress' WHERE id = ?").run(rep.id);
    expect(service.listReports("open").some((r) => r.id === rep.id)).toBe(true);
    await service.syncReportsMarkdown();
    const md = await Bun.file(join(workDir, "docs", "ADMIN-REPORTS.md")).text();
    expect(md).toContain("En cours \\| avec pipe");
  });

  test("le filtre « pending » inclut les objectifs en cours", async () => {
    const goal = await service.createGoal({ userId: "1", title: "Actif", description: "d" });
    dbs.sqlite.query("UPDATE admin_goals SET status = 'in_progress' WHERE id = ?").run(goal.id);
    expect(service.listGoals("pending").some((g) => g.id === goal.id)).toBe(true);
  });

  test("escapeMdCell neutralise pipes et retours à la ligne", () => {
    expect(escapeMdCell("a|b\nc")).toBe("a\\|b c");
    expect(escapeMdCell(null)).toBe("");
  });
});

describe("TrainingService — banc gold", () => {
  test("une question déjà présente n'est pas ajoutée deux fois, le fichier reste en JSONL", async () => {
    const file = join(workDir, "gold.jsonl");
    // Dernière ligne sans saut de ligne : l'ajout ne doit pas la fusionner.
    await Bun.write(file, JSON.stringify({ q: "Qui est Goku ?", expect: ["Son Goku"] }));
    const saved = { path: process.env.RAG_GOLD_PATH, legacy: process.env.RAG_GOLD };
    delete process.env.RAG_GOLD;
    process.env.RAG_GOLD_PATH = file;
    try {
      const training = new TrainingService(dbs, new CanonService(null as any));
      expect(await training.addGoldCase("qui est goku ?", ["Goku"])).toBe(false);
      expect(await training.addGoldCase("Qui est Vegeta ?", ["Vegeta"])).toBe(true);
      const cases = await training.loadGoldCases();
      expect(cases.map((c) => c.q)).toEqual(["Qui est Goku ?", "Qui est Vegeta ?"]);
    } finally {
      if (saved.path === undefined) delete process.env.RAG_GOLD_PATH;
      else process.env.RAG_GOLD_PATH = saved.path;
      if (saved.legacy !== undefined) process.env.RAG_GOLD = saved.legacy;
    }
  });
});
