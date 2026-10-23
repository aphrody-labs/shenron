import "./setup";
import { describe, expect, test } from "bun:test";
import { ButtonStyle, ComponentType } from "discord.js";
import {
  ACCENT_COLORS,
  UiBuildError,
  actions,
  attachmentUrl,
  button,
  canvasFile,
  card,
  clip,
  customId,
  link,
  media,
  notice,
  noticeText,
  resolveAccent,
  section,
  select,
  separator,
  text,
  validate,
} from "../src/ui";

const ID = customId("demo", 1, "go");

describe("card()", () => {
  test("serialises to the Container shape of the API, in the documented order", () => {
    const shown = canvasFile(Buffer.from([1, 2, 3]), "card.png", "Profile card");
    const json = card({
      accent: "level",
      title: "Goku",
      lines: ["Level 12", "1 200 XP"],
      thumbnail: { url: "https://dragonballfr.com/a.png", description: "avatar" },
      media: { url: shown.url, description: "Profile card" },
      blocks: [section({ lines: ["Row"], button: button({ id: ID, label: "Open" }) })],
      footer: "Updated now",
      actions: actions(
        button({ id: customId("demo", 1, "other"), label: "More", style: "primary" }),
      ),
    }).toJSON();

    expect(json).toEqual({
      type: ComponentType.Container,
      accent_color: ACCENT_COLORS.level,
      components: [
        {
          type: ComponentType.Section,
          components: [{ type: ComponentType.TextDisplay, content: "## Goku\nLevel 12\n1 200 XP" }],
          accessory: {
            type: ComponentType.Thumbnail,
            media: { url: "https://dragonballfr.com/a.png" },
            description: "avatar",
          },
        },
        {
          type: ComponentType.MediaGallery,
          items: [{ media: { url: "attachment://card.png" }, description: "Profile card" }],
        },
        {
          type: ComponentType.Section,
          components: [{ type: ComponentType.TextDisplay, content: "Row" }],
          accessory: {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            custom_id: ID,
            label: "Open",
          },
        },
        { type: ComponentType.TextDisplay, content: "-# Updated now" },
        { type: ComponentType.Separator, spacing: 1, divider: true },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              custom_id: "demo:v1:other",
              label: "More",
            },
          ],
        },
      ],
    });
    expect(validate({ components: [card({ title: "x" })], files: [] })).toEqual([]);
  });

  test("header without thumbnail is one Text Display; no divider without actions", () => {
    const json = card({ title: "Title", lines: ["line"] }).toJSON();
    expect(json.components).toEqual([
      { type: ComponentType.TextDisplay, content: "## Title\nline" },
    ]);
  });

  test("falsy blocks and actions are skipped, so conditions can be written inline", () => {
    const json = card({
      title: "T",
      blocks: [null, undefined, false, text("kept")],
      actions: [null, false],
    }).toJSON();
    expect(json.components).toHaveLength(2);
  });

  test("an empty card, or a thumbnail without text, is a coding error", () => {
    expect(() => card({})).toThrow(UiBuildError);
    expect(() => card({ thumbnail: "https://dragonballfr.com/a.png" })).toThrow(UiBuildError);
  });

  test("accent: domain names, explicit RGB, and range checks", () => {
    expect(card({ title: "x" }).toJSON().accent_color).toBe(ACCENT_COLORS.brand);
    expect(card({ title: "x", accent: "economy" }).toJSON().accent_color).toBe(0xffb200);
    expect(card({ title: "x", accent: 0x123456 }).toJSON().accent_color).toBe(0x123456);
    expect(resolveAccent("games")).toBe(ACCENT_COLORS.games);
    expect(() => resolveAccent(-1)).toThrow(RangeError);
    expect(() => resolveAccent(0x1000000)).toThrow(RangeError);
    for (const color of Object.values(ACCENT_COLORS)) {
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThanOrEqual(0xffffff);
    }
  });

  test("a newline in the title or footer collapses (a heading is one line)", () => {
    const json = card({ title: "A\nB", footer: "x\ny" }).toJSON();
    expect(json.components?.[0]).toMatchObject({ content: "## A B" });
    expect(json.components?.[1]).toMatchObject({ content: "-# x y" });
  });

  test("spoiler hides the whole card", () => {
    expect(card({ title: "x", spoiler: true }).toJSON().spoiler).toBe(true);
  });
});

describe("section(), text(), media(), separator()", () => {
  test("a section needs 1-3 lines and exactly one accessory", () => {
    expect(() => section({ lines: [], thumbnail: "https://dragonballfr.com/a.png" })).toThrow(
      UiBuildError,
    );
    expect(() =>
      section({ lines: ["a", "b", "c", "d"], thumbnail: "https://dragonballfr.com/a.png" }),
    ).toThrow(UiBuildError);
    const json = section({
      lines: ["a", "b", "c"],
      thumbnail: { url: "https://dragonballfr.com/a.png", spoiler: true },
    }).toJSON();
    expect(json.components).toHaveLength(3);
    expect(json.accessory).toMatchObject({ type: ComponentType.Thumbnail, spoiler: true });
  });

  test("text() joins arrays, trims, and refuses empty text", () => {
    expect(text(["a", "b"]).toJSON().content).toBe("a\nb");
    expect(() => text("   ")).toThrow(UiBuildError);
    expect(() => text([])).toThrow(UiBuildError);
  });

  test("media(): 1 to 10 items, http(s) or attachment:// only, alt text clipped", () => {
    expect(() => media([])).toThrow(UiBuildError);
    expect(() => media(Array.from({ length: 11 }, () => "https://dragonballfr.com/a.png"))).toThrow(
      UiBuildError,
    );
    expect(() => media("ftp://example.test/a.png")).toThrow(UiBuildError);
    expect(() => media("javascript:alert(1)")).toThrow(UiBuildError);
    const json = media({
      url: "https://dragonballfr.com/a.png",
      description: "x".repeat(2000),
    }).toJSON();
    expect(json.items[0]?.description).toHaveLength(1024);
    expect(
      media(Array.from({ length: 10 }, () => "attachment://a.png")).toJSON().items,
    ).toHaveLength(10);
  });

  test("separator(): spacing and divider options", () => {
    expect(separator().toJSON()).toMatchObject({ spacing: 1, divider: true });
    expect(separator({ spacing: "large", divider: false }).toJSON()).toMatchObject({
      spacing: 2,
      divider: false,
    });
  });

  test("canvasFile(): attachment name is a plain file name and builds the reference", () => {
    const file = canvasFile(new Uint8Array([1, 2]), "profile-1.png", "alt");
    expect(file.url).toBe("attachment://profile-1.png");
    expect(file.file.name).toBe("profile-1.png");
    expect(file.file.description).toBe("alt");
    expect(attachmentUrl("a.webp")).toBe("attachment://a.webp");
    expect(() => attachmentUrl("../etc/passwd")).toThrow(UiBuildError);
    expect(() => attachmentUrl("a b.png")).toThrow(UiBuildError);
  });
});

describe("actions()", () => {
  test("a row of up to 5 buttons, links included; styles map to the API", () => {
    const row = actions(
      button({ id: ID, label: "P", style: "primary" }),
      button({ id: ID + "1", label: "S", style: "success" }),
      button({ id: ID + "2", label: "D", style: "danger" }),
      button({ id: ID + "3", emoji: "🔥", disabled: true }),
      link({ url: "https://dragonballfr.com", label: "Site", emoji: "🌐" }),
    ).toJSON();
    expect(row.components.map((c) => c.type)).toEqual(Array(5).fill(ComponentType.Button));
    expect(row.components.map((c) => (c as { style: number }).style)).toEqual([
      ButtonStyle.Primary,
      ButtonStyle.Success,
      ButtonStyle.Danger,
      ButtonStyle.Secondary,
      ButtonStyle.Link,
    ]);
    expect(row.components[3]).toMatchObject({ disabled: true, emoji: { name: "🔥" } });
    expect(row.components[4]).toMatchObject({ url: "https://dragonballfr.com" });
    expect(row.components[4]).not.toHaveProperty("custom_id");
  });

  test("six buttons, an empty row, or a select mixed with buttons are refused", () => {
    const b = (i: number) => button({ id: `x:v1:${i}`, label: "b" });
    expect(() => actions(b(1), b(2), b(3), b(4), b(5), b(6))).toThrow(UiBuildError);
    expect(() => actions()).toThrow(UiBuildError);
    expect(() => actions(null, false, undefined)).toThrow(UiBuildError);
    expect(() =>
      actions(b(1), select({ id: "x:v1:s", options: [{ label: "A", value: "a" }] })),
    ).toThrow(UiBuildError);
  });

  test("falsy items are skipped (conditional buttons)", () => {
    const show = false;
    const row = actions(
      show && button({ id: ID, label: "hidden" }),
      button({ id: ID + "1", label: "shown" }),
    );
    expect(row.toJSON().components).toHaveLength(1);
  });

  test("a button needs a label or an emoji, a link needs http(s), ids are bounded", () => {
    expect(() => actions(button({ id: ID }))).toThrow(UiBuildError);
    expect(() => actions(link({ url: "javascript:alert(1)", label: "x" }))).toThrow(UiBuildError);
    expect(() => actions(button({ id: "x".repeat(101), label: "x" }))).toThrow(UiBuildError);
    expect(() => actions(button({ id: "", label: "x" }))).toThrow(UiBuildError);
  });

  test("labels are clipped to 80 characters, an invalid emoji is dropped not sent", () => {
    const [built] = actions(
      button({ id: ID, label: "L".repeat(200), emoji: "not-an-emoji" }),
    ).toJSON().components;
    expect((built as { label: string }).label).toHaveLength(80);
    expect((built as { emoji?: unknown }).emoji).toBeUndefined();
  });

  test("a select: options, placeholder clip, values never clipped, max values bounded", () => {
    const row = actions(
      select({
        id: customId("demo", 1, "pick"),
        placeholder: "P".repeat(300),
        options: [
          { label: "One", value: "1", description: "D".repeat(300), emoji: "🐉", default: true },
          { label: "Two", value: "2" },
        ],
        maxValues: 5,
      }),
    ).toJSON();
    const menu = row.components[0] as unknown as {
      type: number;
      placeholder: string;
      max_values: number;
      options: Array<{ label: string; description?: string; default?: boolean; emoji?: unknown }>;
    };
    expect(menu.type).toBe(ComponentType.StringSelect);
    expect(menu.placeholder).toHaveLength(150);
    expect(menu.max_values).toBe(2);
    expect(menu.options[0]?.description).toHaveLength(100);
    expect(menu.options[0]).toMatchObject({ default: true, emoji: { name: "🐉" } });

    expect(() => actions(select({ id: ID, options: [] }))).toThrow(UiBuildError);
    expect(() =>
      actions(
        select({
          id: ID,
          options: Array.from({ length: 26 }, (_, i) => ({ label: "x", value: `v${i}` })),
        }),
      ),
    ).toThrow(UiBuildError);
    expect(() =>
      actions(select({ id: ID, options: [{ label: "x", value: "v".repeat(101) }] })),
    ).toThrow(UiBuildError);
    expect(() =>
      actions(
        select({
          id: ID,
          options: [
            { label: "a", value: "same" },
            { label: "b", value: "same" },
          ],
        }),
      ),
    ).toThrow(UiBuildError);
  });
});

describe("notice()", () => {
  test("one compact line with an icon per kind, from a dictionary key", () => {
    expect(notice("fr", "success", "ui.cancelled").toJSON()).toEqual({
      type: ComponentType.TextDisplay,
      content: "✅ Action annulée.",
    });
    expect(notice("en", "error", "ui.invalidPage", { max: 7 }).toJSON().content).toBe(
      "❌ Invalid page: enter a number between 1 and 7.",
    );
    expect(notice("ja", "info", "ui.cancelled").toJSON().content).toBe(
      "ℹ️ 操作をキャンセルしました。",
    );
  });

  test("noticeText collapses line breaks and clips", () => {
    expect(noticeText("info", "a\n  b\n\nc").toJSON().content).toBe("ℹ️ a b c");
    expect(noticeText("error", "x".repeat(5000)).toJSON().content.length).toBeLessThanOrEqual(1010);
  });
});

describe("clip()", () => {
  test("keeps short text, ends with an ellipsis, never splits a surrogate pair", () => {
    expect(clip("abc", 5)).toBe("abc");
    expect(clip("abcdef", 4)).toBe("abc…");
    const clipped = clip("😀😀😀", 4);
    expect(clipped).toBe("😀…");
    expect(clipped.length).toBeLessThanOrEqual(4);
    expect(clip("x", 0)).toBe("…");
  });
});
