// SPDX-License-Identifier: Apache-2.0
/**
 * TypeScript port of the `aphrody-shell-vfs` conformance suite (`crates/shell/vfs/src/conformance.rs`,
 * aphrody-labs/aphrody) run against `ShenronVfs`. The only divergence is the non-UTF-8 name case:
 * SQLite TEXT paths are UTF-8, so the binary-name check uses a non-ASCII UTF-8 name instead.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { normalize, resolve, ShenronVfs, splitParent, join, VfsError } from "../src/vfs";

const make = () => new ShenronVfs(new Database(":memory:"));
const enc = (s: string) => new TextEncoder().encode(s);
const code = (fn: () => unknown): string => {
  try {
    fn();
    return "ok";
  } catch (error) {
    return error instanceof VfsError ? error.code : `unexpected ${String(error)}`;
  }
};
const names = (v: ShenronVfs, p: string) => v.readDir(p).map((e) => e.name);

describe("path normalisation (path.rs)", () => {
  test("basics", () => {
    expect(normalize("/")).toBe("/");
    expect(normalize("//a/./b//../c/")).toBe("/a/c");
    expect(normalize("/../..")).toBe("/");
    expect(code(() => normalize("a"))).toBe("InvalidPath");
    expect(code(() => normalize(""))).toBe("InvalidPath");
    expect(code(() => normalize("/a\0b"))).toBe("InvalidPath");
    expect(code(() => normalize(`/${"x".repeat(256)}`))).toBe("InvalidPath");
    expect(normalize(`/${"x".repeat(255)}`).length).toBe(256);
  });
  test("resolve relative", () => {
    expect(resolve("/a/b", "../c")).toBe("/a/c");
    expect(resolve("/a", "/x/./y")).toBe("/x/y");
    expect(resolve("/", "..")).toBe("/");
    expect(code(() => resolve("rel", "x"))).toBe("InvalidPath");
  });
  test("parent split and join", () => {
    expect(splitParent("/")).toBeNull();
    expect(splitParent("/a")).toEqual({ parent: "/", name: "a" });
    expect(splitParent("/a/b")).toEqual({ parent: "/a", name: "b" });
    expect(join("/", "a")).toBe("/a");
    expect(join("/a", "b")).toBe("/a/b");
  });
  test("normal form is idempotent (property)", () => {
    const alphabet = ["/", "/", ".", "..", "a", "bc", "//", "./", "../"];
    let s = 0x9e3779b97f4a7c15n;
    const rng = () => {
      s ^= (s << 13n) & 0xffffffffffffffffn;
      s ^= s >> 7n;
      s ^= (s << 17n) & 0xffffffffffffffffn;
      return s;
    };
    for (let i = 0; i < 2000; i++) {
      const n = Number(rng() % 12n);
      let p = "/";
      for (let j = 0; j < n; j++) p += alphabet[Number(rng() % BigInt(alphabet.length))];
      const norm = normalize(p);
      expect(norm.startsWith("/")).toBe(true);
      expect(norm === "/" || !norm.endsWith("/")).toBe(true);
      expect(norm.includes("//")).toBe(false);
      expect(normalize(norm)).toBe(norm);
      expect(resolve("/", p.slice(1))).toBe(norm);
      expect(normalize(`${p}/x/..`)).toBe(norm);
    }
  });
});

describe("Vfs conformance (conformance.rs)", () => {
  test("root and paths", () => {
    const v = make();
    expect(v.stat("/").kind).toBe("dir");
    expect(v.stat("/").size).toBe(0);
    expect(v.readDir("/")).toEqual([]);
    expect(code(() => v.stat("/nope"))).toBe("NotFound");
    expect(code(() => v.stat("relative"))).toBe("InvalidPath");
    expect(code(() => v.stat(""))).toBe("InvalidPath");
    expect(code(() => v.write("/a\0b", "x"))).toBe("InvalidPath");
    v.write("/f", "1");
    expect(v.readTextSync("//./x/../f/")).toBe("1");
    expect(v.stat("/../../f").size).toBe(1);
  });

  test("files", () => {
    const v = make();
    v.write("/f", "hello");
    expect(v.readTextSync("/f")).toBe("hello");
    expect(v.stat("/f").kind).toBe("file");
    expect(v.stat("/f").size).toBe(5);
    v.write("/f", "hi");
    expect(v.readTextSync("/f")).toBe("hi");
    v.write("/empty", "");
    expect(v.readSync("/empty").byteLength).toBe(0);
    const bin = Uint8Array.from({ length: 256 }, (_, i) => i);
    v.write("/bin", bin);
    expect([...v.readSync("/bin")]).toEqual([...bin]);
    expect(code(() => v.readSync("/missing"))).toBe("NotFound");
    expect(code(() => v.write("/no/parent", "x"))).toBe("NotFound");
    expect(code(() => v.write("/f/child", "x"))).toBe("NotADirectory");
    v.mkdir("/d");
    expect(code(() => v.write("/d", "x"))).toBe("IsADirectory");
    expect(code(() => v.readSync("/d"))).toBe("IsADirectory");
    const unicode = "/ドラゴンボール·神龍";
    v.write(unicode, "raw");
    expect(v.readTextSync(unicode)).toBe("raw");
    expect(v.stat(unicode).size).toBe(enc("raw").byteLength);
  });

  test("directories", () => {
    const v = make();
    v.mkdir("/d");
    expect(code(() => v.mkdir("/d"))).toBe("AlreadyExists");
    expect(code(() => v.mkdir("/"))).toBe("AlreadyExists");
    expect(code(() => v.mkdir("/x/y"))).toBe("NotFound");
    v.write("/f", "");
    expect(code(() => v.mkdir("/f"))).toBe("AlreadyExists");
    expect(code(() => v.mkdir("/f/y"))).toBe("NotADirectory");
    v.write("/d/b", "1");
    v.write("/d/a", "22");
    v.mkdir("/d/c");
    v.write("/d/c/deep", "x");
    const list = v.readDir("/d");
    expect(list.map((e) => e.name)).toEqual(["a", "b", "c"]);
    expect(list[0]?.kind).toBe("file");
    expect(list[2]?.kind).toBe("dir");
    expect(code(() => v.readDir("/f"))).toBe("NotADirectory");
    expect(code(() => v.readDir("/zzz"))).toBe("NotFound");
    v.mkdir("/d2");
    expect(names(v, "/d").length).toBe(3);
  });

  test("remove", () => {
    const v = make();
    v.mkdir("/d");
    v.write("/d/f", "x");
    expect(code(() => v.remove("/d"))).toBe("DirectoryNotEmpty");
    expect(code(() => v.remove("/"))).toBe("InvalidInput");
    expect(code(() => v.remove("/zzz"))).toBe("NotFound");
    v.remove("/d/f");
    expect(code(() => v.readSync("/d/f"))).toBe("NotFound");
    v.remove("/d");
    expect(v.exists("/d")).toBe(false);
  });

  test("rename", () => {
    const v = make();
    v.write("/a", "A");
    v.rename("/a", "/b");
    expect(code(() => v.readSync("/a"))).toBe("NotFound");
    expect(v.readTextSync("/b")).toBe("A");
    v.write("/c", "C");
    v.rename("/b", "/c");
    expect(v.readTextSync("/c")).toBe("A");
    v.rename("/c", "/c");
    expect(v.readTextSync("/c")).toBe("A");
    expect(code(() => v.rename("/nope", "/x"))).toBe("NotFound");
    expect(code(() => v.rename("/c", "/no/x"))).toBe("NotFound");

    v.mkdirAll("/src/sub");
    v.write("/src/sub/f", "F");
    v.write("/src/g", "G");
    v.mkdir("/dst");
    v.rename("/src", "/dst");
    expect(v.readTextSync("/dst/sub/f")).toBe("F");
    expect(v.readTextSync("/dst/g")).toBe("G");
    expect(names(v, "/dst")).toEqual(["g", "sub"]);
    expect(v.exists("/src")).toBe(false);
    expect(code(() => v.rename("/dst", "/dst/sub/in"))).toBe("InvalidInput");
    v.mkdir("/full");
    v.write("/full/x", "");
    expect(code(() => v.rename("/dst", "/full"))).toBe("DirectoryNotEmpty");
    expect(code(() => v.rename("/c", "/dst"))).toBe("IsADirectory");
    expect(code(() => v.rename("/dst", "/c"))).toBe("NotADirectory");
    expect(code(() => v.rename("/", "/r"))).toBe("InvalidInput");
  });

  test("helpers", () => {
    const v = make();
    v.append("/log", "a");
    v.append("/log", "b");
    expect(v.readTextSync("/log")).toBe("ab");
    v.mkdirAll("/p/q/r");
    v.mkdirAll("/p/q/r");
    expect(code(() => v.mkdirAll("/log/x"))).toBe("NotADirectory");
    v.write("/p/q/r/f", "x");
    v.removeAll("/p");
    expect(v.exists("/p")).toBe(false);
    expect(v.exists("/log")).toBe(true);
    v.removeAll("/");
    expect(v.readDir("/")).toEqual([]);
  });

  test("read-only mode rejects every mutation", () => {
    const db = new Database(":memory:");
    new ShenronVfs(db).write("/f", "x");
    const ro = new ShenronVfs(db, { readOnly: true });
    expect(ro.readTextSync("/f")).toBe("x");
    for (const op of [
      () => ro.write("/g", "y"),
      () => ro.mkdir("/d"),
      () => ro.remove("/f"),
      () => ro.rename("/f", "/h"),
      () => ro.removeAll("/"),
    ])
      expect(code(op)).toBe("ReadOnly");
  });
});
