import "./setup";
import { describe, expect, test } from "bun:test";
import { AttachmentBuilder, ComponentType, MessageFlags } from "discord.js";
import {
  LIMITS,
  UiValidationError,
  actions,
  analyze,
  assertValid,
  button,
  canvasFile,
  card,
  customId,
  media,
  select,
  text,
  validate,
  type UiIssue,
} from "../src/ui";

const T = ComponentType;
const codes = (issues: UiIssue[]) => issues.map((issue) => issue.code);
const container = (...components: unknown[]) => ({ type: T.Container, components });
const textNode = (content: string) => ({ type: T.TextDisplay, content });
const btn = (id: string, extra: Record<string, unknown> = {}) => ({
  type: T.Button,
  style: 2,
  custom_id: id,
  label: "b",
  ...extra,
});
const row = (...components: unknown[]) => ({ type: T.ActionRow, components });

describe("validate(): sizes", () => {
  test("a normal card is valid and measured the way Discord counts", () => {
    const view = card({
      title: "T",
      lines: ["x"],
      thumbnail: "https://dragonballfr.com/a.png",
      actions: actions(button({ id: customId("v", 1, "a"), label: "A" })),
    });
    const analysis = analyze([view]);
    expect(analysis.issues).toEqual([]);
    // Container + Section + Text + Thumbnail + Separator + Row + Button
    expect(analysis.components).toBe(7);
    expect(analysis.depth).toBe(3);
    expect(analysis.textLength).toBe("## T\nx".length);
  });

  test("40 components pass, 41 fail", () => {
    const withTexts = (n: number) =>
      card({ blocks: Array.from({ length: n }, (_, i) => text(`line ${i}`)) });
    expect(analyze([withTexts(39)]).components).toBe(40);
    expect(validate({ components: [withTexts(39)] })).toEqual([]);
    const issues = validate({ components: [withTexts(40)] });
    expect(codes(issues)).toEqual(["components"]);
    expect(issues[0]?.message).toContain("41");
  });

  test("the 4 000 character text budget is shared by every Text Display", () => {
    const two = (a: number, b: number) =>
      card({ blocks: [text("a".repeat(a)), text("b".repeat(b))] });
    expect(validate({ components: [two(2000, 2000)] })).toEqual([]);
    const issues = validate({ components: [two(2000, 2001)] });
    expect(codes(issues)).toEqual(["text-total"]);
    expect(LIMITS.textTotal).toBe(4000);
  });

  test("a top-level list of components counts as one message", () => {
    const parts = Array.from({ length: 41 }, (_, i) => text(`t${i}`));
    expect(codes(validate({ components: parts }))).toEqual(["components"]);
    expect(validate({ components: parts.slice(0, 40) })).toEqual([]);
  });
});

describe("validate(): structure and nesting", () => {
  test("a Container cannot be nested; the depth limit is 3", () => {
    const nested = container(container(textNode("x")));
    expect(codes(validate({ components: [nested] }))).toContain("structure");
    const deep = container(container(row(btn("a:v1:x"))));
    expect(codes(validate({ components: [deep] }))).toContain("depth");
    expect(analyze([deep]).depth).toBe(4);
  });

  test("a Container holds rows, texts, sections, galleries, separators and files only", () => {
    const issues = validate({
      components: [
        container(btn("a:v1:x"), { type: T.Thumbnail, media: { url: "https://a.test/a.png" } }),
      ],
    });
    expect(issues.filter((i) => i.code === "structure").length).toBeGreaterThanOrEqual(2);
  });

  test("a button or thumbnail cannot sit at the top level; an empty container is refused", () => {
    expect(codes(validate({ components: [btn("a:v1:x")] }))).toContain("structure");
    expect(codes(validate({ components: [container()] }))).toContain("structure");
    expect(codes(validate({ components: [] }))).toContain("structure");
  });

  test("a Section needs 1-3 texts and a button or thumbnail accessory", () => {
    const ok = {
      type: T.Section,
      components: [textNode("a")],
      accessory: btn("a:v1:x"),
    };
    expect(validate({ components: [ok] })).toEqual([]);
    expect(codes(validate({ components: [{ ...ok, accessory: undefined }] }))).toContain(
      "structure",
    );
    expect(
      codes(validate({ components: [{ ...ok, components: Array(4).fill(textNode("a")) }] })),
    ).toContain("structure");
    expect(codes(validate({ components: [{ ...ok, components: [btn("a:v1:y")] }] }))).toContain(
      "structure",
    );
    expect(
      codes(validate({ components: [{ ...ok, accessory: textNode("not an accessory") }] })),
    ).toContain("structure");
  });

  test("a row holds up to 5 buttons or exactly one select", () => {
    const six = row(...Array.from({ length: 6 }, (_, i) => btn(`a:v1:${i}`)));
    expect(codes(validate({ components: [six] }))).toEqual(["structure"]);
    const menu = {
      type: T.StringSelect,
      custom_id: "a:v1:m",
      options: [{ label: "A", value: "a" }],
    };
    expect(codes(validate({ components: [row(menu, btn("a:v1:b"))] }))).toContain("structure");
    expect(codes(validate({ components: [row()] }))).toContain("structure");
    expect(validate({ components: [row(menu)] })).toEqual([]);
  });

  test("separator spacing and accent colour are range-checked", () => {
    const badSeparator = container(textNode("x"), { type: T.Separator, spacing: 3 });
    expect(codes(validate({ components: [badSeparator] }))).toEqual(["structure"]);
    const badColor = { ...container(textNode("x")), accent_color: 0x1000000 };
    expect(codes(validate({ components: [badColor] }))).toEqual(["structure"]);
  });
});

describe("validate(): ids, labels, options", () => {
  test("custom_id: 1-100 characters, unique in the message", () => {
    expect(codes(validate({ components: [row(btn("x".repeat(101)))] }))).toEqual(["custom-id"]);
    expect(codes(validate({ components: [row(btn(""))] }))).toEqual(["custom-id"]);
    expect(codes(validate({ components: [row(btn("a:v1:x"), btn("a:v1:x"))] }))).toEqual([
      "duplicate-id",
    ]);
    expect(validate({ components: [row(btn("x".repeat(100)))] })).toEqual([]);
  });

  test("buttons: label at most 80, label or emoji required, link buttons have a url and no id", () => {
    expect(
      codes(validate({ components: [row(btn("a:v1:x", { label: "L".repeat(81) }))] })),
    ).toEqual(["label"]);
    expect(codes(validate({ components: [row(btn("a:v1:x", { label: undefined }))] }))).toEqual([
      "label",
    ]);
    expect(
      validate({ components: [row(btn("a:v1:x", { label: undefined, emoji: { name: "🔥" } }))] }),
    ).toEqual([]);
    const link = { type: T.Button, style: 5, label: "Site", url: "https://dragonballfr.com" };
    expect(validate({ components: [row(link)] })).toEqual([]);
    expect(codes(validate({ components: [row({ ...link, custom_id: "a:v1:x" })] }))).toEqual([
      "custom-id",
    ]);
    expect(codes(validate({ components: [row({ ...link, url: undefined })] }))).toEqual(["url"]);
  });

  test("selects: 1-25 options, bounded labels and values, unique values, placeholder 150", () => {
    const menu = (extra: Record<string, unknown>) => ({
      type: T.StringSelect,
      custom_id: "a:v1:m",
      options: [{ label: "A", value: "a" }],
      ...extra,
    });
    expect(codes(validate({ components: [row(menu({ options: [] }))] }))).toEqual(["options"]);
    expect(
      codes(
        validate({
          components: [
            row(
              menu({
                options: Array.from({ length: 26 }, (_, i) => ({ label: "x", value: `v${i}` })),
              }),
            ),
          ],
        }),
      ),
    ).toEqual(["options"]);
    expect(codes(validate({ components: [row(menu({ placeholder: "p".repeat(151) }))] }))).toEqual([
      "label",
    ]);
    expect(
      codes(
        validate({
          components: [
            row(
              menu({
                options: [
                  { label: "x", value: "same" },
                  { label: "y", value: "same" },
                ],
              }),
            ),
          ],
        }),
      ),
    ).toEqual(["options"]);
  });

  test("media: 1-10 items, http(s) or attachment urls, description at most 1 024", () => {
    const gallery = (items: unknown[]) => ({ type: T.MediaGallery, items });
    const item = (url: unknown, description?: string) => ({ media: { url }, description });
    expect(validate({ components: [gallery([item("https://a.test/a.png")])] })).toEqual([]);
    expect(codes(validate({ components: [gallery([])] }))).toEqual(["structure"]);
    expect(
      codes(
        validate({
          components: [gallery(Array.from({ length: 11 }, () => item("https://a.test/a.png")))],
        }),
      ),
    ).toEqual(["structure"]);
    expect(codes(validate({ components: [gallery([item("ftp://a.test/a")])] }))).toEqual(["url"]);
    expect(
      codes(validate({ components: [gallery([item("https://a.test/a", "d".repeat(1025))])] })),
    ).toEqual(["label"]);
  });

  test("an empty or blank Text Display is refused", () => {
    expect(codes(validate({ components: [textNode("")] }))).toEqual(["empty-text"]);
    expect(codes(validate({ components: [textNode("   \n")] }))).toEqual(["empty-text"]);
  });
});

describe("validate(): attachments and payload", () => {
  test("every attachment:// reference is sent, and every file is referenced", () => {
    const shown = canvasFile(Buffer.from([1]), "card.png");
    const view = card({ title: "x", media: shown.url });
    expect(validate({ components: [view], files: [shown.file] })).toEqual([]);
    expect(validate({ components: [view], files: ["card.png"] })).toEqual([]);

    const missing = validate({ components: [view], files: [] });
    expect(codes(missing)).toEqual(["attachment"]);
    expect(missing[0]?.message).toContain("card.png");

    const unreferenced = validate({
      components: [card({ title: "x" })],
      files: [new AttachmentBuilder(Buffer.from([1]), { name: "stray.png" })],
    });
    expect(codes(unreferenced)).toEqual(["attachment"]);
  });

  test("without a files list the attachment cross-check is skipped", () => {
    expect(validate({ components: [card({ title: "x", media: "attachment://a.png" })] })).toEqual(
      [],
    );
    expect(analyze([card({ title: "x", blocks: [media("attachment://a.png")] })]).issues).toEqual(
      [],
    );
  });

  test("content, embeds, poll and stickers are refused; the V2 flag is required", () => {
    const view = [card({ title: "x" })];
    expect(codes(validate({ components: view, content: "hi" }))).toEqual(["payload"]);
    expect(codes(validate({ components: view, embeds: [{}] }))).toEqual(["payload"]);
    expect(codes(validate({ components: view, poll: {} }))).toEqual(["payload"]);
    expect(codes(validate({ components: view, stickers: ["1"] }))).toEqual(["payload"]);
    expect(codes(validate({ components: view, flags: MessageFlags.Ephemeral }))).toEqual([
      "payload",
    ]);
    expect(
      validate({ components: view, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }),
    ).toEqual([]);
  });

  test("assertValid throws UiValidationError listing the paths", () => {
    expect(() => assertValid({ components: [card({ title: "x" })] })).not.toThrow();
    try {
      assertValid({ components: [row(btn("a:v1:x"), btn("a:v1:x"))] });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(UiValidationError);
      expect((err as UiValidationError).issues[0]?.code).toBe("duplicate-id");
      expect((err as Error).message).toContain("components[0].components[1]");
    }
  });

  test("a builder that cannot serialise is reported as an issue, not thrown", () => {
    const broken = {
      toJSON: () => {
        throw new Error("boom");
      },
    };
    expect(codes(validate({ components: [broken] }))).toEqual(["builder"]);
  });
});

describe("builders respect the limits they can clip", () => {
  test("a select built from a long text list stays valid", () => {
    const view = card({
      title: "T",
      actions: actions(
        select({
          id: customId("v", 1, "s"),
          placeholder: "P".repeat(500),
          options: Array.from({ length: 25 }, (_, i) => ({
            label: "L".repeat(300),
            value: `v${i}`,
            description: "D".repeat(300),
          })),
        }),
      ),
    });
    expect(validate({ components: [view] })).toEqual([]);
  });
});
