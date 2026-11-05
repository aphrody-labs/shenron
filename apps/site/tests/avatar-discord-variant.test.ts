import { describe, expect, test } from "bun:test";
import { discordAvatarVariant } from "../src/components/Avatar";

const HASH = "0123456789abcdef0123456789abcdef";

describe("discordAvatarVariant", () => {
  test("sert l'avatar Discord depuis l'origine du site, en WebP statique ~1,75x borné à 128 px", () => {
    const url = `https://cdn.discordapp.com/avatars/123456789012345678/a_${HASH}.gif?size=1024`;
    expect(discordAvatarVariant(url, 32)).toBe(
      `/api/avatar/123456789012345678/a_${HASH}.webp?s=64`,
    );
    const png = `https://cdn.discordapp.com/avatars/123456789012345678/${HASH}.png`;
    expect(discordAvatarVariant(png, 36)).toBe(`/api/avatar/123456789012345678/${HASH}.webp?s=64`);
    expect(discordAvatarVariant(png, 48)).toBe(`/api/avatar/123456789012345678/${HASH}.webp?s=128`);
    expect(discordAvatarVariant(png, 200)).toBe(
      `/api/avatar/123456789012345678/${HASH}.webp?s=128`,
    );
    expect(discordAvatarVariant(png, 16)).toBe(`/api/avatar/123456789012345678/${HASH}.webp?s=32`);
  });

  test("avatar par défaut proxifié ; autres hôtes, hash inattendu et valeurs vides intacts", () => {
    expect(discordAvatarVariant("https://cdn.dragonballfr.com/a.png", 32)).toBe(
      "https://cdn.dragonballfr.com/a.png",
    );
    expect(discordAvatarVariant("https://cdn.discordapp.com/embed/avatars/3.png", 32)).toBe(
      "/api/avatar/default/3.png",
    );
    expect(discordAvatarVariant("https://cdn.discordapp.com/avatars/1/abc.png", 32)).toBe(
      "https://cdn.discordapp.com/avatars/1/abc.png",
    );
    expect(discordAvatarVariant(null, 32)).toBeNull();
    expect(discordAvatarVariant("/relative.png", 32)).toBe("/relative.png");
  });
});
