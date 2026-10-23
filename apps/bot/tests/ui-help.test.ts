/**
 * Pilot of the Components V2 kit: `/help` (name unchanged) rebuilt on `~/ui`. Checks the view
 * against the Discord limits in the three languages, the ephemeral reply, the versioned menu id
 * and the localized command description.
 */
import "./setup"; // must be first
import { describe, expect, mock, test } from "bun:test";
import { ComponentType, MessageFlags, PermissionsBitField } from "discord.js";
import { MetadataStorage, type DApplicationCommand } from "discordx";
import {
  CATEGORIES,
  HELP_MENU_PATTERN,
  HelpCommand,
  OTHER_CATEGORY,
  buildCategoryView,
  buildHomeView,
} from "../src/commands/admin/Help";
import type { BotLang } from "../src/lib/i18n";
import { analyze, parseCustomId, validate, type UiMessage } from "../src/ui";

const LANGS: BotLang[] = ["fr", "en", "ja"];

type Node = {
  type: number;
  content?: string;
  custom_id?: string;
  url?: string;
  label?: string;
  options?: Array<{ value: string; label: string; default?: boolean }>;
  components?: Node[];
  accent_color?: number;
};
const root = (view: UiMessage): Node =>
  (view.components[0] as unknown as { toJSON(): Node }).toJSON();
function walk(node: Node, found: Node[] = []): Node[] {
  found.push(node);
  for (const child of node.components ?? []) walk(child, found);
  return found;
}
const select = (view: UiMessage) =>
  walk(root(view)).find((n) => n.type === ComponentType.StringSelect)!;
const links = (view: UiMessage) =>
  walk(root(view)).filter((n) => n.type === ComponentType.Button && n.url);
const texts = (view: UiMessage) =>
  walk(root(view))
    .filter((n) => n.type === ComponentType.TextDisplay)
    .map((n) => n.content!);
const textsOf = (payload: { components: Array<{ toJSON(): Node }> }) =>
  walk(payload.components[0]!.toJSON())
    .filter((n) => n.type === ComponentType.TextDisplay)
    .map((n) => n.content!)
    .join("\n");

function fakeCommand(
  name: string,
  description: string,
  localized?: Record<string, string>,
  group?: string,
) {
  return {
    name,
    group,
    description,
    descriptionLocalizations: localized ?? null,
  } as unknown as DApplicationCommand;
}

describe("/help views", () => {
  test("the home view lists the visible categories and is a valid V2 message in every language", () => {
    for (const lang of LANGS) {
      for (const canSeeMod of [false, true]) {
        const view = buildHomeView(lang, canSeeMod, 42);
        expect(validate({ components: view.components })).toEqual([]);
        const visible = CATEGORIES.filter((c) => !c.modOnly || canSeeMod);
        const options = select(view).options!;
        expect(options.map((o) => o.value)).toEqual(["home", ...visible.map((c) => c.key)]);
        expect(options.find((o) => o.default)?.value).toBe("home");
        expect(links(view)).toHaveLength(3);
        expect(links(view).every((l) => l.url!.startsWith("https://"))).toBe(true);
      }
    }
    const fr = buildHomeView("fr", false, 1);
    expect(texts(fr).join("\n")).toContain("Centre d'aide Shenron");
    expect(texts(fr).at(-1)).toBe("-# 1 commande active");
    const ja = buildHomeView("ja", true, 7);
    expect(texts(ja).at(-1)).toBe("-# 有効なコマンド7件");
  });

  test("the menu id is versioned and the legacy id still routes to the handler", () => {
    const id = select(buildHomeView("fr", false, 0)).custom_id!;
    expect(parseCustomId(id)).toEqual({ ns: "help", version: 1, args: ["category"] });
    expect(HELP_MENU_PATTERN.test(id)).toBe(true);
    expect(HELP_MENU_PATTERN.test("help:category")).toBe(true);
    expect(HELP_MENU_PATTERN.test("help:v2:category")).toBe(false);
    expect(HELP_MENU_PATTERN.test("shop:category")).toBe(false);
  });

  test("a category view: sorted lines, the accent of the domain, the right option selected", () => {
    const cat = CATEGORIES.find((c) => c.key === "eco")!;
    const view = buildCategoryView(
      "en",
      cat,
      [
        fakeCommand("shop", "Browse"),
        fakeCommand("buy", "Buy"),
        fakeCommand("list", "", {}, "config"),
      ],
      false,
    );
    const body = texts(view)[0]!;
    expect(body.indexOf("`/buy`")).toBeLessThan(body.indexOf("`/config list`"));
    expect(body).toContain("**`/config list`** — No description.");
    expect(root(view).accent_color).toBe(0xffb200);
    expect(select(view).options!.find((o) => o.default)?.value).toBe("eco");
    expect(texts(view).at(-1)).toBe("-# 3 active commands");
  });

  test("command descriptions use the member's locale when a localization exists", () => {
    const cat = CATEGORIES.find((c) => c.key === "eco")!;
    const command = fakeCommand("shop", "Browse the shop", { fr: "Parcourir la boutique" });
    expect(texts(buildCategoryView("fr", cat, [command], false, "fr"))[0]).toContain(
      "Parcourir la boutique",
    );
    expect(texts(buildCategoryView("en", cat, [command], false, "en-US"))[0]).toContain(
      "Browse the shop",
    );
  });

  test("a category with hundreds of commands keeps whole lines and stays inside the limits", () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      fakeCommand(`command-${String(i).padStart(3, "0")}`, "A fairly long description ".repeat(8)),
    );
    const other = CATEGORIES.find((c) => c.key === OTHER_CATEGORY)!;
    for (const lang of LANGS) {
      const view = buildCategoryView(lang, other, many, true);
      expect(validate({ components: view.components })).toEqual([]);
      expect(analyze(view.components).textLength).toBeLessThanOrEqual(4000);
      const lines = texts(view)[0]!.split("\n");
      const commandLines = lines.filter((line) => line.startsWith("• "));
      // Whole lines only: every kept line is complete (ends with the clipped description).
      expect(commandLines.length).toBeGreaterThan(5);
      expect(commandLines.length).toBeLessThan(300);
      expect(commandLines.every((line) => /\*\*`\/command-\d{3}`\*\* — /.test(line))).toBe(true);
      // The hidden count is announced on the last line.
      expect(lines.at(-1)).toContain(String(300 - commandLines.length));
    }
  });

  test("every category renders in every language without leaking a missing key", () => {
    for (const lang of LANGS) {
      for (const cat of CATEGORIES) {
        const view = buildCategoryView(lang, cat, [], true);
        expect(texts(view).join("\n")).not.toMatch(/help\.|ui\./);
        expect(validate({ components: view.components })).toEqual([]);
      }
    }
  });
});

describe("/help command", () => {
  function interaction(extra: Record<string, unknown> = {}) {
    return {
      locale: "ja",
      replied: false,
      deferred: false,
      memberPermissions: new PermissionsBitField(),
      isMessageComponent: () => Boolean(extra.values),
      isModalSubmit: () => false,
      isFromMessage: () => false,
      reply: mock(async (..._args: unknown[]) => {}),
      update: mock(async (..._args: unknown[]) => {}),
      editReply: mock(async (..._args: unknown[]) => {}),
      ...extra,
    };
  }
  type Sent = { components: Array<{ toJSON(): Node }>; flags: number } & Record<string, unknown>;

  test("answers ephemeral, in the member's language, as a Components V2 message", async () => {
    const i = interaction();
    await new HelpCommand().help(i as never);
    expect(i.reply).toHaveBeenCalledTimes(1);
    const payload = i.reply.mock.calls[0]![0] as unknown as Sent;
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    expect(payload.allowedMentions).toEqual({ parse: [] });
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("embeds");
    expect(textsOf(payload)).toContain("Shenron ヘルプセンター");
  });

  test("the category menu edits the message in place; staff categories stay hidden from members", async () => {
    const member = interaction({ values: ["wiki"], locale: "en-US" });
    await new HelpCommand().onSelectCategory(member as never);
    expect(member.update).toHaveBeenCalledTimes(1);
    const shown = member.update.mock.calls[0]![0] as unknown as Sent;
    expect(shown.flags).toBe(MessageFlags.IsComponentsV2);
    expect(shown.content).toBeNull();
    expect(shown.embeds).toEqual([]);
    expect(textsOf(shown)).toContain("Wiki and canon lore");

    // A crafted selection of a staff category falls back to the home view.
    const sneaky = interaction({ values: ["mod"] });
    await new HelpCommand().onSelectCategory(sneaky as never);
    const fallback = sneaky.update.mock.calls[0]![0] as unknown as Sent;
    expect(textsOf(fallback)).toContain("Shenron ヘルプセンター");
    expect(textsOf(fallback)).not.toContain("制裁");

    const staff = interaction({
      values: ["mod"],
      memberPermissions: new PermissionsBitField(PermissionsBitField.Flags.ModerateMembers),
    });
    await new HelpCommand().onSelectCategory(staff as never);
    const staffView = staff.update.mock.calls[0]![0] as unknown as Sent;
    expect(textsOf(staffView)).toContain("モデレーション");
  });

  test("the slash command keeps its name; the description is English with fr and ja localizations", async () => {
    const storage = MetadataStorage.instance;
    await storage.build();
    const help = storage.applicationCommandSlashesFlat.find((c) => c.name === "help")!;
    expect(help.description).toBe("Open the Shenron help center");
    expect(help.descriptionLocalizations).toEqual({
      fr: "Ouvrir le centre d'aide de Shenron",
      ja: "Shenron のヘルプセンターを開く",
    });
    expect(help.name.length).toBeLessThanOrEqual(32);
    expect(help.description.length).toBeLessThanOrEqual(100);
  });
});
