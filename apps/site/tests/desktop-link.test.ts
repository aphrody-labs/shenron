// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { desktopCallbackUrl, desktopLinkPort } from "@aphrody/shenron-db/agent-homes/types";
import { signDesktopLink, verifyDesktopLink } from "@aphrody/shenron-api/desktop-link";

const SECRET = "x".repeat(40);
const STATE = "s".repeat(32);
const identity = {
  discordId: "123456789012345678",
  name: "Goku",
  avatarUrl: "https://cdn.discordapp.com/a.png",
  language: "en" as const,
};

describe("desktop sign-in codes", () => {
  test("round trip, bound to the state, two minutes", () => {
    const code = signDesktopLink(SECRET, identity, STATE, 1_000);
    expect(verifyDesktopLink(SECRET, code, STATE, 2_000)).toEqual(identity);
    expect(verifyDesktopLink(SECRET, code, "t".repeat(32), 2_000)).toBeNull();
    expect(verifyDesktopLink(SECRET, code, STATE, 1_000 + 120_001)).toBeNull();
    expect(verifyDesktopLink("y".repeat(40), code, STATE, 2_000)).toBeNull();
    const [body] = code.split(".");
    expect(verifyDesktopLink(SECRET, `${body}.00`, STATE, 2_000)).toBeNull();
  });

  test("the callback is loopback only, on an unprivileged port", () => {
    expect(desktopLinkPort("80")).toBeNull();
    expect(desktopLinkPort("abc")).toBeNull();
    expect(desktopLinkPort("4123")).toBe(4123);
    expect(desktopCallbackUrl(4123, STATE, "c")).toBe(
      `http://127.0.0.1:4123/api/local/agent-home/callback?state=${STATE}&code=c`,
    );
  });
});
