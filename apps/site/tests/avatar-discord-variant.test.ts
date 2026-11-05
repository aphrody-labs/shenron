import { describe, expect, test } from "bun:test";
import { discordAvatarVariant } from "../src/components/Avatar";

describe("discordAvatarVariant", () => {
  test("transforme un GIF animé Discord en WebP statique ~1,75x, borné à 128 px", () => {
    expect(
      discordAvatarVariant("https://cdn.discordapp.com/avatars/123456789/a_abcdef.gif?size=1024", 32),
    ).toBe("https://cdn.discordapp.com/avatars/123456789/a_abcdef.webp?size=64&animated=false");
    expect(
      discordAvatarVariant("https://cdn.discordapp.com/avatars/1/abc.png", 36),
    ).toBe("https://cdn.discordapp.com/avatars/1/abc.webp?size=64&animated=false");
    expect(
      discordAvatarVariant("https://cdn.discordapp.com/avatars/1/abc.png", 48),
    ).toBe("https://cdn.discordapp.com/avatars/1/abc.webp?size=128&animated=false");
    expect(
      discordAvatarVariant("https://cdn.discordapp.com/avatars/1/abc.png", 200),
    ).toBe("https://cdn.discordapp.com/avatars/1/abc.webp?size=128&animated=false");
    expect(
      discordAvatarVariant("https://cdn.discordapp.com/avatars/1/abc.png", 16),
    ).toBe("https://cdn.discordapp.com/avatars/1/abc.webp?size=32&animated=false");
  });

  test("laisse intacts les autres hôtes, les avatars par défaut et les valeurs vides", () => {
    expect(discordAvatarVariant("https://cdn.dragonballfr.com/a.png", 32)).toBe(
      "https://cdn.dragonballfr.com/a.png",
    );
    expect(discordAvatarVariant("https://cdn.discordapp.com/embed/avatars/3.png", 32)).toBe(
      "https://cdn.discordapp.com/embed/avatars/3.png",
    );
    expect(discordAvatarVariant(null, 32)).toBeNull();
    expect(discordAvatarVariant("/relative.png", 32)).toBe("/relative.png");
  });
});
