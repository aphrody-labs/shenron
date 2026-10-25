import { beforeEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
let viewer: { discordId: string; user: { username: string } } | null = null;
let status = "absent";
let calls = 0;
const xpProgressPercent = mock(() => 0);
mock.module("@/components/kit", () => ({ DomainBar: () => null }));
mock.module("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
mock.module("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
mock.module("@/lib/shenron", () => ({
  xpProgressPercent,
  getShenronUserResult: async () => {
    calls++;
    return { status };
  },
}));
mock.module("@/lib/session", () => ({ getSessionUser: async () => viewer }));
mock.module("@/lib/account-data", () => ({ readPublicProfileActivity: async () => null }));
mock.module("@/lib/contributors", () => ({ getMemberContributions: async () => null }));
mock.module("@/components/T", () => ({ T: ({ k }: { k: string }) => <span>{k}</span> }));
mock.module("@/components/user/UserNav", () => ({ UserNav: () => <nav>account-navigation</nav> }));
mock.module("@/components/history/ContinueRail", () => ({
  ContinueRail: () => <div>continue-library</div>,
}));
mock.module("@/components/GatedLink", () => ({
  GatedWrap: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
mock.module("@/components/profile/ProfileCardCustomizer", () => ({
  ProfileCardCustomizer: () => null,
}));
const { default: ProfilePage } = await import("../src/app/profile/[id]/page");
const id = "281114294152724491";
const page = (value = id, member = "1") =>
  ProfilePage({
    params: Promise.resolve({ id: value }),
    searchParams: Promise.resolve({ member }),
  });
beforeEach(() => {
  viewer = null;
  status = "absent";
  calls = 0;
  xpProgressPercent.mockClear();
});
describe("Missing community profile", () => {
  test("keeps personal library and real session identity without fictional game stats", async () => {
    viewer = { discordId: id, user: { username: "GokuDuo" } };
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("GokuDuo");
    expect(html).toContain("profile.communityMissingMessage");
    expect(html).toContain("continue-library");
    expect(html).toContain("profile.libraryTitle");
    expect(html).not.toContain("XP total");
    expect(html).not.toContain("Dossier concours");
    expect(xpProgressPercent).not.toHaveBeenCalled();
  });
  test("anonymous visitors still receive 404", async () => {
    await expect(page()).rejects.toThrow("NOT_FOUND");
  });
  test("another signed-in member cannot see the personal fallback", async () => {
    viewer = { discordId: "999999", user: { username: "Other" } };
    await expect(page()).rejects.toThrow("NOT_FOUND");
  });
  test("public URL stays absent even for its owner", async () => {
    viewer = { discordId: id, user: { username: "GokuDuo" } };
    await expect(page(id, "")).rejects.toThrow("NOT_FOUND");
  });
  test("invalid identifiers never reach the community API", async () => {
    await expect(page("../admin")).rejects.toThrow("NOT_FOUND");
    expect(calls).toBe(0);
  });
});
