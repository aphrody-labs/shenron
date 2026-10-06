// SPDX-License-Identifier: Apache-2.0
// AppShell: a navigation link, a section toggle and a content link all take
// the click; nothing in the shell covers or disables the page.
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type MouseEvent } from "react";
import { AppShell, type ShellLinkProps, type ShellNavSection } from "../../src/navigation/AppShell";

afterEach(cleanup);

const sections: ShellNavSection[] = [
  { id: "discover", label: "Discover", items: [{ href: "/", label: "Home" }] },
  {
    id: "encyclopedia",
    label: "Encyclopedia",
    items: [
      { href: "/wiki/characters", label: "Characters" },
      { href: "/wiki/sagas", label: "Sagas" },
    ],
  },
];

function Harness() {
  const [pathname, setPathname] = useState("/");
  const visited: string[] = [];
  const Link = ({ href, children, onClick, ...rest }: ShellLinkProps) => (
    <a
      href={href}
      {...rest}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        event.preventDefault();
        visited.push(href);
        setPathname(href);
      }}
    >
      {children}
    </a>
  );
  return (
    <AppShell
      pathname={pathname}
      brand={{ href: "/", label: "Home page", mark: null, name: "Dragon Ball" }}
      sections={sections}
      tabs={[{ href: "/", label: "Home tab" }]}
      linkComponent={Link}
      tauri={false}
    >
      <p data-testid="path">{pathname}</p>
      <Link href="/news">Latest news</Link>
    </AppShell>
  );
}

describe("AppShell clicks", () => {
  test("a section opens and its link navigates", () => {
    render(<Harness />);
    const sidebar = screen.getByRole("complementary");
    const toggle = within(sidebar).getByRole("button", { name: "Encyclopedia" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(sidebar).getByRole("link", { name: "Characters" }));
    expect(screen.getByTestId("path").textContent).toBe("/wiki/characters");
    expect(
      within(sidebar).getByRole("link", { name: "Characters" }).getAttribute("aria-current"),
    ).toBe("page");
  });

  test("a content link navigates and nothing in the shell is inert", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("link", { name: "Latest news" }));
    expect(screen.getByTestId("path").textContent).toBe("/news");
    expect(container.querySelector("[inert]")).toBeNull();
    expect(container.querySelector("main")?.closest("[aria-hidden='true']")).toBeNull();
  });
});
