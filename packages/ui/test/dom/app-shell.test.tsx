// SPDX-License-Identifier: Apache-2.0
// AppShell: a navigation link, a section toggle and a content link all take
// the click; nothing in the shell covers or disables the page.
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createContext, useContext, useState, type MouseEvent } from "react";
import { AppShell, type ShellLinkProps, type ShellNavSection } from "../../src/navigation/AppShell";
import { SHELL_SIDEBAR_ATTR, SHELL_SIDEBAR_KEY } from "../../src/navigation/ShellBoot";

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  document.documentElement.removeAttribute(SHELL_SIDEBAR_ATTR);
  localStorage.removeItem(SHELL_SIDEBAR_KEY);
});

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

const NavigateContext = createContext<(pathname: string) => void>(() => {});
function HarnessLink({ href, children, onClick, ...rest }: ShellLinkProps) {
  const navigate = useContext(NavigateContext);
  return (
    <a
      href={href}
      {...rest}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
function Harness({ siteStyle = false }: { siteStyle?: boolean } = {}) {
  const [pathname, setPathname] = useState("/");
  return (
    <NavigateContext.Provider value={setPathname}>
      <AppShell
        pathname={pathname}
        siteStyle={siteStyle}
        brand={{ href: "/", label: "Home page", mark: null, name: "Dragon Ball" }}
        sections={sections}
        tabs={[{ href: "/", label: "Home tab" }]}
        linkComponent={HarnessLink}
        tauri={false}
      >
        <p data-testid="path">{pathname}</p>
        <HarnessLink href="/news">Latest news</HarnessLink>
      </AppShell>
    </NavigateContext.Provider>
  );
}

describe("AppShell clicks", () => {
  test("route changes dismiss the sheet and back navigation does not reopen it", async () => {
    const shell = (pathname: string) => (
      <AppShell
        pathname={pathname}
        brand={{ href: "/", label: "Home page", name: "Dragon Ball", mark: null }}
        sections={sections}
        tabs={[]}
        tauri={false}
      >
        <h1>{pathname}</h1>
      </AppShell>
    );
    const { rerender } = render(shell("/"));
    fireEvent.click(screen.getByRole("button", { name: "Plus" }));
    await screen.findByRole("dialog");
    rerender(shell("/wiki/characters"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    rerender(shell("/"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Plus" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  test("sidebar follows its boot preference and storage changes", async () => {
    document.documentElement.setAttribute(SHELL_SIDEBAR_ATTR, "collapsed");
    render(<Harness />);
    expect(
      screen.getAllByRole("button", { name: "Déplier la barre latérale" }).length,
    ).toBeGreaterThan(0);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: SHELL_SIDEBAR_KEY, newValue: "expanded" }),
      );
    });
    expect(document.documentElement.hasAttribute(SHELL_SIDEBAR_ATTR)).toBe(false);
    expect(
      screen.getAllByRole("button", { name: "Replier la barre latérale" }).length,
    ).toBeGreaterThan(0);
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true }),
      );
    });
    expect(localStorage.getItem(SHELL_SIDEBAR_KEY)).toBe("collapsed");
    expect(
      screen.getAllByRole("button", { name: "Déplier la barre latérale" }).length,
    ).toBeGreaterThan(0);
  });
  test("the public site uses a horizontal navigation without changing app navigation", async () => {
    const { container } = render(<Harness siteStyle />);
    const shell = container.querySelector('[data-shell-variant="site"]');
    expect(shell?.firstElementChild?.getAttribute("data-shell-header")).toBe("site");
    expect(shell?.querySelector('[data-shell-navigation="horizontal"]')).not.toBeNull();
    const menu = screen.getByRole("button", { name: "Encyclopedia" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("link", { name: "Characters" }));
    expect(screen.getByTestId("path").textContent).toBe("/wiki/characters");
  });

  test("selecting the current destination closes the mobile sheet", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Plus" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("link", { name: "Home" }), { ctrlKey: true });
    expect(screen.getByRole("dialog")).toBe(sheet);
    fireEvent.click(within(sheet).getByRole("link", { name: "Home" }));
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
    expect(screen.getByTestId("path").textContent).toBe("/");
    expect(screen.getByRole("button", { name: "Plus" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  test("switching to desktop closes the sheet and releases its media listener on unmount", async () => {
    const listeners = new Set<() => void>();
    let desktop = false;
    window.matchMedia = ((query: string) =>
      query === "(min-width: 64rem)"
        ? {
            media: query,
            get matches() {
              return desktop;
            },
            addEventListener: (_: string, listener: () => void) => listeners.add(listener),
            removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
          }
        : originalMatchMedia.call(window, query)) as typeof window.matchMedia;
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Plus" }));
    await screen.findByRole("dialog");
    act(() => {
      desktop = true;
      for (const listener of listeners) listener();
    });
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
    expect(document.querySelector("main")?.closest("[aria-hidden='true']")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Latest news" }));
    expect(screen.getByTestId("path").textContent).toBe("/news");
    unmount();
    expect(listeners.size).toBe(0);
  });

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
