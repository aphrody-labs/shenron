import "./setup"; // must be first
import { describe, expect, test } from "bun:test";

const { diffInvites } = await import("~/services/InviteTracker");
const { newestVideo } = await import("~/services/TikTokService");
const { isProxyUrl } = await import("~/commands/utility/TikTok");

describe("invite attribution", () => {
  const inv = (uses: number, inviterId: string, maxUses = 0) => ({ uses, maxUses, inviterId });

  test("the invite whose uses grew wins", () => {
    const before = new Map([
      ["a", inv(1, "u1")],
      ["b", inv(4, "u2")],
    ]);
    const after = new Map([
      ["a", inv(1, "u1")],
      ["b", inv(5, "u2")],
    ]);
    expect(diffInvites(before, after)).toEqual({ inviterId: "u2", code: "b" });
  });

  test("a limited invite deleted on its last use is still attributed", () => {
    const before = new Map([["once", inv(0, "u3", 1)]]);
    expect(diffInvites(before, new Map())).toEqual({ inviterId: "u3", code: "once" });
  });

  test("a revoked unlimited invite is not a join", () => {
    const before = new Map([["gone", inv(7, "u4")]]);
    expect(diffInvites(before, new Map())).toEqual({ inviterId: null, code: null });
  });
});

describe("TikTok watch", () => {
  test("newest video is picked by date, not by position", () => {
    const pinned = { id: "old", createTime: 100, desc: "", url: "", cover: null };
    const fresh = { id: "new", createTime: 900, desc: "", url: "", cover: null };
    expect(newestVideo([pinned, fresh] as never).id).toBe("new");
  });

  test("proxy URLs are validated before being saved", () => {
    expect(isProxyUrl("http://host:8080")).toBe(true);
    expect(isProxyUrl("https://user:pass@host:443")).toBe(true);
    expect(isProxyUrl("socks5://host:1080")).toBe(false);
    expect(isProxyUrl("host:8080")).toBe(false);
  });
});
