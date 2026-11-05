import { describe, expect, test } from "bun:test";
import {
  discordAvatarUpstream,
  firstPartyImage,
  wikimediaProxyPath,
  wikimediaUpstream,
} from "../src/lib/first-party-media";

const HASH = "0123456789abcdef0123456789abcdef";

describe("discordAvatarUpstream", () => {
  test("accepte snowflake + hash + taille connue", () => {
    expect(discordAvatarUpstream("123456789012345678", `${HASH}.webp`, "64")).toBe(
      `https://cdn.discordapp.com/avatars/123456789012345678/${HASH}.webp?size=64&animated=false`,
    );
    expect(discordAvatarUpstream("default", "4.png", null)).toBe(
      "https://cdn.discordapp.com/embed/avatars/4.png",
    );
  });
  test("refuse tout le reste (pas de proxy ouvert)", () => {
    expect(discordAvatarUpstream("../x", `${HASH}.webp`, "64")).toBeNull();
    expect(discordAvatarUpstream("123456789012345678", "../../etc.webp", "64")).toBeNull();
    expect(discordAvatarUpstream("123456789012345678", `${HASH}.webp`, "4096")).toBeNull();
    expect(discordAvatarUpstream("default", "9.png", null)).toBeNull();
  });
});

describe("wikimedia proxy", () => {
  const photo = "https://upload.wikimedia.org/wikipedia/en/1/15/Akira_Toriyama_in_1982.jpg";
  test("aller-retour : URL -> chemin first-party -> URL d'origine", () => {
    const path = wikimediaProxyPath(photo);
    expect(path).toBe("/api/ext-image/upload/wikipedia/en/1/15/Akira_Toriyama_in_1982.jpg");
    expect(wikimediaUpstream(path!.replace("/api/ext-image/", "").split("/"))).toBe(photo);
  });
  test("vignettes encodées conservées, requête retirée", () => {
    const thumb =
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/%E9%87%8E.png/330px-%E9%87%8E.png?utm_source=x";
    const path = wikimediaProxyPath(thumb);
    expect(path).toBe(
      "/api/ext-image/thumb/wikipedia/commons/thumb/b/b1/%E9%87%8E.png/330px-%E9%87%8E.png",
    );
  });
  test("refuse autre hôte, autre extension, remontée de dossier", () => {
    expect(wikimediaProxyPath("https://evil.example/a/b/c.jpg")).toBeNull();
    expect(wikimediaProxyPath("https://upload.wikimedia.org/a/b/c.html")).toBeNull();
    expect(wikimediaUpstream(["upload", "..", "b", "c.jpg"])).toBeNull();
    expect(wikimediaUpstream(["evil", "a", "b", "c.jpg"])).toBeNull();
    expect(wikimediaUpstream(["upload", "a", "b"])).toBeNull();
  });
  test("firstPartyImage ne touche que Wikimedia", () => {
    expect(firstPartyImage(photo)).toStartWith("/api/ext-image/upload/");
    expect(firstPartyImage("https://cdn.dragonballfr.com/a.jpg")).toBe(
      "https://cdn.dragonballfr.com/a.jpg",
    );
    expect(firstPartyImage(null)).toBeNull();
  });
});
