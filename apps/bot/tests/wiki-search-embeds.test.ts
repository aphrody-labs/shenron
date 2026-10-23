import "./setup";
import { beforeAll, describe, expect, it } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "../src/db/index";
import { dbCharacters } from "../src/db/schema";
import { WikiService } from "../src/services/WikiService";
import {
  clip,
  cut,
  fitList,
  linkLabel,
  respondAutocomplete,
  safeChoices,
  siteLink,
  wikiAssetUrl,
} from "../src/lib/wiki-embeds";

const dbs = container.resolve(DatabaseService);
const wiki = container.resolve(WikiService);

beforeAll(async () => {
  await dbs.db.insert(dbCharacters).values([
    { id: 9101, name: "Zz Goku Black", image: "x.png", race: "Saiyan" },
    { id: 9102, name: "Zz Goku", image: "x.png", race: "Saiyan", nameRomaji: "Son Zz" },
    { id: 9103, name: "Le Zz Goku masqué", image: "x.png", visible: false },
    { id: 9104, name: "100% Zz", image: "x.png" },
    { id: 9105, name: "Abc Zz Goku", image: "x.png" },
  ]);
});

describe("WikiService.search", () => {
  it("ranks the exact name, then prefixes, never a hidden entry", async () => {
    const names = (await wiki.search("zz goku")).map((c) => c.name);
    expect(names).toEqual(["Zz Goku", "Zz Goku Black", "Abc Zz Goku"]);
  });

  it("matches the romaji name", async () => {
    expect((await wiki.search("son zz")).map((c) => c.id)).toEqual([9102]);
  });

  it("treats % and _ as literal characters", async () => {
    expect((await wiki.search("100%")).map((c) => c.id)).toEqual([9104]);
    expect(await wiki.search("z_ goku")).toEqual([]);
  });
});

describe("wiki embed helpers", () => {
  it("keeps autocomplete within Discord limits", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: `${"Nom très long ".repeat(10)}${i}`,
      value: String(i),
    }));
    const choices = safeChoices([
      { name: "dup", value: "1" },
      { name: "too long", value: "x".repeat(101) },
      ...many,
    ]);
    expect(choices.length).toBe(25);
    expect(choices.every((c) => c.name.length <= 100 && c.value.length <= 100)).toBe(true);
    expect(new Set(choices.map((c) => c.value)).size).toBe(25);
    expect(choices[0]).toEqual({ name: "dup", value: "1" });
  });

  it("answers an empty list when the source is too slow or fails", async () => {
    const responses: unknown[] = [];
    const interaction = {
      commandName: "wiki",
      respond: async (choices: unknown) => {
        responses.push(choices);
      },
    } as never;
    await respondAutocomplete(interaction, () => new Promise(() => {}), 20);
    await respondAutocomplete(interaction, async () => {
      throw new Error("down");
    });
    await respondAutocomplete(interaction, async () => [{ name: "Goku", value: "1" }]);
    expect(responses).toEqual([[], [], [{ name: "Goku", value: "1" }]]);
  });

  it("cuts text without breaking links", () => {
    expect(clip("  a\n\nb  ", 10)).toBe("a b");
    expect(clip("abcdefghij", 5)).toBe("abcd…");
    expect(cut("line one\nline two\nline three", 20)).toBe("line one\nline two…");
    const links = ["[A](u1)", "[B](u2)", "[C](u3)", "[D](u4)"];
    const fitted = fitList(links, " · ", 30);
    expect(fitted.length).toBeLessThanOrEqual(30);
    expect(fitted).toContain("… +");
    expect(fitted.split(" · ").every((part) => part.startsWith("[") || part.startsWith("…"))).toBe(
      true,
    );
    expect(fitList(["a", "b"], ", ", 100)).toBe("a, b");
    expect(linkLabel("Le [secret] de Bardock")).toBe("Le secret de Bardock");
  });

  it("resolves site and asset URLs", () => {
    expect(siteLink("https://x.test/a")).toBe("https://x.test/a");
    expect(siteLink("/wiki/canon")).toMatch(/^https?:\/\/[^/]+\/wiki\/canon$/);
    expect(wikiAssetUrl(null)).toBeNull();
    expect(wikiAssetUrl("../secret")).toBeNull();
    expect(wikiAssetUrl("./assets/dbz/goku.png")).toMatch(/\/db\/assets\/dbz\/goku\.png$/);
  });
});
