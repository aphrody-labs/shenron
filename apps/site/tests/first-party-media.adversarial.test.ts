/**
 * Revue adversariale de la liste blanche des proxys d'images first-party (SSRF / proxy ouvert).
 * Fonctions pures uniquement : aucune requete reseau.
 */
import { describe, expect, test } from "bun:test";
import {
  discordAvatarProxyPath,
  discordAvatarUpstream,
  wikimediaProxyPath,
  wikimediaUpstream,
} from "../src/lib/first-party-media";

const HASH = "0123456789abcdef0123456789abcdef";
const UID = "123456789012345678";

function assertPinned(url: string, host: string): URL {
  const u = new URL(url);
  expect(u.protocol).toBe("https:");
  expect(u.hostname).toBe(host);
  expect(u.port).toBe("");
  expect(u.username).toBe("");
  expect(u.password).toBe("");
  expect(u.hash).toBe("");
  return u;
}

/** Segments hostiles (un segment = un element du tableau, comme `raw.split("/")` dans la route). */
const EVIL_SEGMENTS = [
  "..",
  ".",
  "%2e%2e",
  "%2E%2E",
  ".%2e",
  "%2e.",
  "%2e",
  "%252e%252e",
  "%2f",
  "%2F",
  "%5c",
  "%5C",
  "..%2f",
  "%2e%2e%2f",
  "a%2f..%2fb",
  "%00",
  "a%00b",
  "%0a",
  "%0d%0a",
  "%u002e",
  "%c0%ae%c0%ae",
  "%ef%bc%8f",
  "%e2%80%a5",
  "．．",
  "‥",
  "..\\",
  "a\\b",
  "\\\\evil.com",
  "/",
  "a/b",
  "",
  " ",
  "a b",
  "a\tb",
  "a\nb",
  "evil.com",
  "evil.com:80",
  "user@evil.com",
  "@evil.com",
  "evil.com#",
  "x?y",
  "x#y",
  "x:y",
  "http:",
  "https:",
  "//evil.com",
  "[::1]",
  "127.0.0.1",
  "169.254.169.254",
  "localhost",
  "a;b",
  "a=b",
  "a&b",
  "a$b",
  "a|b",
  "a<b",
  "a>b",
  'a"b',
  "a`b",
  "a{b}",
  "a^b",
  "a".repeat(301),
  "\u0000",
  "‮",
  "é",
  "K",
];
const KINDS = [
  "upload",
  "thumb",
  "UPLOAD",
  "Thumb",
  "upload.",
  "upload ",
  " upload",
  "upload.evil.com",
  "evil.com",
  "upload@evil.com",
  "upload/evil.com",
  "",
  "__proto__",
  "constructor",
  "uploadx",
  "upload\u0000",
  "upload%00",
  "http:",
  "//",
  "..",
];

function checkWiki(segments: readonly string[]): void {
  const out = wikimediaUpstream(segments);
  if (out === null) return;
  const kind = segments[0];
  expect(["upload", "thumb"]).toContain(kind as string);
  assertPinned(out, `${kind}.wikimedia.org`);
}

describe("wikimediaUpstream : hote, schema, port, userinfo fixes", () => {
  test("chaque segment hostile, a toute position, ne change jamais l'hote", () => {
    for (const evil of EVIL_SEGMENTS) {
      for (const kind of ["upload", "thumb"]) {
        for (let pos = 0; pos < 4; pos++) {
          const rest = ["wikipedia", "en", "1", "x.png"];
          rest.splice(pos, 0, evil);
          checkWiki([kind, ...rest]);
        }
        checkWiki([kind, "wikipedia", "commons", evil]);
        checkWiki([kind, evil, evil, `${evil}.png`]);
      }
    }
  });

  test("kind hostile : seulement upload|thumb exacts", () => {
    for (const kind of KINDS) {
      const out = wikimediaUpstream([kind, "wikipedia", "en", "x.png"]);
      if (kind === "upload" || kind === "thumb") {
        expect(out).toBe(`https://${kind}.wikimedia.org/wikipedia/en/x.png`);
      } else {
        expect(out).toBeNull();
      }
    }
  });

  test("caracteres structurels refuses (/ : @ ? # \\ espace controle)", () => {
    for (const bad of ["a/b", "a:b", "u@h", "a?b", "a#b", "a\\b", "a b", "a\nb", "\u0000"]) {
      expect(wikimediaUpstream(["upload", "wikipedia", "en", `${bad}.png`])).toBeNull();
      expect(wikimediaUpstream(["upload", bad, "en", "x.png"])).toBeNull();
    }
  });

  test("bornes de segments : 3 a 12, extension image obligatoire", () => {
    const seg = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
    expect(wikimediaUpstream(["upload", "a", "x.png"])).toBeNull();
    expect(wikimediaUpstream(["upload", "x.png"])).toBeNull();
    expect(wikimediaUpstream(["upload", "a", "b", "x.png"])).not.toBeNull();
    expect(wikimediaUpstream(["upload", ...seg(11), "x.png"])).not.toBeNull();
    expect(wikimediaUpstream(["upload", ...seg(12), "x.png"])).toBeNull();
    expect(wikimediaUpstream(["upload"])).toBeNull();
    expect(wikimediaUpstream([])).toBeNull();
    const badNames = [
      "x",
      "x.",
      "x.pngx",
      "x.png.html",
      "x.html",
      "x.js",
      "x.php",
      "x.png%00.html",
      "x.tiff",
      "x.pdf",
      ".png.",
      "x.PNG ",
      "x.png\n",
    ];
    for (const name of badNames) {
      expect(wikimediaUpstream(["upload", "a", "b", name])).toBeNull();
    }
    for (const name of ["x.png", "x.PNG", "x.jpg", "x.jpeg", "x.webp", "x.gif", "x.svg", "x.SVG"]) {
      expect(wikimediaUpstream(["upload", "a", "b", name])).not.toBeNull();
    }
  });

  test("fuzz deterministe : 20000 entrees, invariant d'hote respecte", () => {
    let s = 0x9e3779b9;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const alphabet = [
      ".",
      "%",
      "2",
      "e",
      "f",
      "5",
      "c",
      "0",
      "/",
      "\\",
      ":",
      "@",
      "?",
      "#",
      "a",
      "-",
      "_",
      "~",
      "é",
      "．",
      " ",
      "\n",
      "x",
      "png",
      ".png",
    ];
    for (let i = 0; i < 20000; i++) {
      const n = 3 + Math.floor(rnd() * 5);
      const segs = [rnd() < 0.5 ? "upload" : "thumb"];
      for (let j = 0; j < n; j++) {
        let t = "";
        const len = 1 + Math.floor(rnd() * 6);
        for (let k = 0; k < len; k++) t += alphabet[Math.floor(rnd() * alphabet.length)];
        segs.push(t);
      }
      if (rnd() < 0.7) segs[segs.length - 1] += ".png";
      checkWiki(segs);
    }
  });
});

describe("wikimediaUpstream : traversal par segments point encodes (corrige)", () => {
  const DOTS = ["%2e%2e", "%2E%2E", ".%2e", "%2e.", "%2e", "."];
  test("tout segment point, brut ou encode, a toute position, est refuse", () => {
    for (const d of DOTS) {
      expect(wikimediaUpstream(["upload", "wikipedia", d, d, "x.png"])).toBeNull();
      expect(wikimediaUpstream(["upload", d, "b", "x.png"])).toBeNull();
      expect(wikimediaUpstream(["thumb", "a", "b", d, "x.png"])).toBeNull();
    }
    expect(wikimediaUpstream(["upload", "a", "b", "%2E%2e", "x.png"])).toBeNull();
    expect(wikimediaUpstream(["upload", "a", "b", "%2e%2e%2e", "x.png"])).not.toBeNull();
  });
  test("%2f et %5c restent encodes dans le chemin (pas de segment supplementaire)", () => {
    const out = wikimediaUpstream(["upload", "a", "b%2f..%2f..%2fc", "x.png"])!;
    expect(new URL(out).pathname).toBe("/a/b%2f..%2f..%2fc/x.png");
    const out2 = wikimediaUpstream(["upload", "a", "b%5c..%5cc", "x.png"])!;
    expect(new URL(out2).pathname).toBe("/a/b%5c..%5cc/x.png");
  });
  test("le chemin amont normalise conserve tous les segments (aucun segment point)", () => {
    for (const d of DOTS) {
      expect(wikimediaUpstream(["upload", "a", d, "x.png"])).toBeNull();
    }
    const out = wikimediaUpstream(["upload", "a", "b", "x.png"])!;
    expect(new URL(out).pathname).toBe("/a/b/x.png");
  });
  test("une entree a 3 segments ne peut pas atterrir a la racine de l'hote", () => {
    expect(wikimediaUpstream(["upload", "a", "%2e%2e", "x.png"])).toBeNull();
  });
  test("wikimediaProxyPath refuse aussi les segments point encodes et les chemins replies", () => {
    for (const d of DOTS.filter((x) => x !== ".")) {
      expect(wikimediaProxyPath(`https://upload.wikimedia.org/wikipedia/en/${d}/a.jpg`)).toBeNull();
    }
    expect(wikimediaProxyPath("https://upload.wikimedia.org//wikipedia/en/1/a.jpg")).toBeNull();
    expect(wikimediaProxyPath("https://upload.wikimedia.org/wikipedia/en/./a.jpg")).toBeNull();
  });
});

describe("wikimediaProxyPath (aller)", () => {
  const ok = "https://upload.wikimedia.org/wikipedia/en/1/15/a.jpg";
  test("refuse hotes, schemas et ports hostiles", () => {
    const bad = [
      "http://upload.wikimedia.org/wikipedia/en/1/a.jpg",
      "https://upload.wikimedia.org.evil.com/wikipedia/en/1/a.jpg",
      "https://evil.com/upload.wikimedia.org/wikipedia/en/1/a.jpg",
      "https://upload.wikimedia.org@evil.com/wikipedia/en/1/a.jpg",
      "https://commons.wikimedia.org/wikipedia/en/1/a.jpg",
      "https://wikimedia.org/wikipedia/en/1/a.jpg",
      "ftp://upload.wikimedia.org/wikipedia/en/1/a.jpg",
      "file:///upload.wikimedia.org/wikipedia/en/1/a.jpg",
      "javascript:alert(1)//upload.wikimedia.org/a/b/c.jpg",
      "https://upload.wikimedia.org/wikipedia/en/1/a.html",
      "https://upload.wikimedia.org/a/b.jpg",
    ];
    for (const u of bad) expect(wikimediaProxyPath(u)).toBeNull();
    expect(wikimediaProxyPath(ok)).toBe("/api/ext-image/upload/wikipedia/en/1/15/a.jpg");
  });
  test("variantes d'hote normalisees par URL restent sur l'hote exact", () => {
    expect(wikimediaProxyPath("https://UPLOAD.WIKIMEDIA.ORG/wikipedia/en/1/a.jpg")).toBe(
      "/api/ext-image/upload/wikipedia/en/1/a.jpg",
    );
    expect(wikimediaProxyPath("HTTPS://upload.wikimedia.org/wikipedia/en/1/a.jpg")).toBe(
      "/api/ext-image/upload/wikipedia/en/1/a.jpg",
    );
    expect(wikimediaProxyPath("https://upload.wikimedia.org./wikipedia/en/1/a.jpg")).toBeNull();
    expect(
      wikimediaProxyPath("https://upload.wikimedia.org:443/wikipedia/en/1/a.jpg"),
    ).not.toBeNull();
  });
  test("segment .. litteral refuse (chemin brut controle avant le repliement par URL)", () => {
    expect(wikimediaProxyPath("https://upload.wikimedia.org/wikipedia/en/1/../a.jpg")).toBeNull();
  });
  test("tout resultat accepte a un aller-retour sur l'hote attendu", () => {
    const inputs = [
      "https://upload.wikimedia.org/wikipedia/en/1/%2e%2e/a.jpg",
      "https://upload.wikimedia.org/wikipedia/en/1/%2E%2E/a.jpg",
      "https://thumb.wikimedia.org/a/b/c%2fd.png",
      "https://upload.wikimedia.org//wikipedia/en/1/a.jpg",
      "https://upload.wikimedia.org/wikipedia/en/1/a.jpg?x=https://evil.com",
    ];
    for (const u of inputs) {
      const p = wikimediaProxyPath(u);
      if (!p) continue;
      const up = wikimediaUpstream(p.replace("/api/ext-image/", "").split("/"));
      if (up) assertPinned(up, new URL(u).hostname);
    }
  });
});

describe("discordAvatarUpstream : hote fixe, identifiants stricts", () => {
  test("seuls snowflake + hash + tailles 32/64/128", () => {
    const evilUsers = [
      "..",
      "../x",
      "%2e%2e",
      "123",
      "12345678901234",
      "1234567890123456789012",
      "0x1234567890123456",
      " 123456789012345678",
      "123456789012345678 ",
      "123456789012345678\n",
      "123456789012345678/..",
      "12345678901234567٣",
      "１２３４５６７８９０１２３４５",
      "1e17000000000000",
      "+12345678901234567",
      "-12345678901234567",
      "123456789012345678%00",
      "123456789012345678?x=1",
      "123456789012345678#",
      "a@b",
      "evil.com",
      "DEFAULT",
      "default ",
      "default/",
      "",
    ];
    for (const u of evilUsers) expect(discordAvatarUpstream(u, `${HASH}.webp`, "64")).toBeNull();
    const evilFiles = [
      "../../x.webp",
      `${HASH}.png`,
      `${HASH}.webp.png`,
      `${HASH}.webp\n`,
      `${HASH}.WEBP`,
      HASH,
      ".webp",
      `${HASH}x.webp`,
      `${HASH.toUpperCase()}.webp`,
      `a_${HASH}.webp.webp`,
      `${HASH.slice(1)}.webp`,
      `${HASH}0.webp`,
      "%2e%2e.webp",
      `a_a_${HASH}.webp`,
      `${HASH}%00.webp`,
      `${HASH}/../x.webp`,
      `${HASH}?x.webp`,
      "\u0000.webp",
    ];
    for (const f of evilFiles) expect(discordAvatarUpstream(UID, f, "64")).toBeNull();
    const evilSizes = [
      "0",
      "-1",
      "16",
      "256",
      "4096",
      "NaN",
      "Infinity",
      "abc",
      "",
      "64abc",
      "6 4",
      "1e3",
      "64/../..",
      "64&size=4096",
      "127.9",
      "129",
    ];
    for (const s of evilSizes) expect(discordAvatarUpstream(UID, `${HASH}.webp`, s)).toBeNull();
    const evilDefault = [
      "../x.png",
      "10.png",
      "6.png",
      "-1.png",
      "1.PNG",
      "1.png/..",
      "1.jpg",
      "01.png",
      "1.png\n",
      "%31.png",
    ];
    for (const f of evilDefault) expect(discordAvatarUpstream("default", f, null)).toBeNull();
  });
  test("accepte les formes canoniques et toujours cdn.discordapp.com en https", () => {
    for (const size of ["32", "64", "128", null]) {
      const out = discordAvatarUpstream(UID, `a_${HASH}.webp`, size)!;
      const u = assertPinned(out, "cdn.discordapp.com");
      expect(u.pathname).toBe(`/avatars/${UID}/a_${HASH}.webp`);
      expect(u.search).toBe(`?size=${size ?? 64}&animated=false`);
    }
  });
  test("formes numeriques non canoniques de `s` refusees (strict /^(32|64|128)$/)", () => {
    for (const s of [
      "0x40",
      "6.4e1",
      " 64",
      "64 ",
      "+64",
      "064",
      "64.0",
      "0b1000000",
      "0o100",
      "64\n",
    ]) {
      expect(discordAvatarUpstream(UID, `${HASH}.webp`, s)).toBeNull();
    }
  });
  test("discordAvatarProxyPath n'emet que des chemins first-party stricts", () => {
    const bad = [
      "https://cdn.discordapp.com.evil.com/avatars/1/x.png",
      `https://evil.com/avatars/${UID}/${HASH}.png`,
      `https://cdn.discordapp.com/avatars/${UID}/../../x/${HASH}.png`,
      `http://cdn.discordapp.com@evil.com/avatars/${UID}/${HASH}.png`,
    ];
    const shape =
      /^\/api\/avatar\/(?:\d{15,21}\/(?:a_)?[0-9a-f]{32}\.webp\?s=64|default\/[0-5]\.png)$/;
    for (const u of bad) {
      const p = discordAvatarProxyPath(u, 64);
      if (p) expect(p).toMatch(shape);
    }
  });
});
