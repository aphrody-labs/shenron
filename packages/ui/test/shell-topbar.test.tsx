// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ShellTopBar } from "../src/navigation/ShellTopBar";
import { SHELL_LABELS_FR } from "../src/navigation/AppShell";
import { shellCrumbKey } from "../src/navigation/crumb-key";

function render(siteStyle: boolean) {
  return renderToStaticMarkup(
    <ShellTopBar
      brand={{ href: "/", name: "Dragon Ball France", label: "Accueil", mark: <svg /> }}
      trail={[{ label: "Wiki", href: "/wiki" }, { label: "Épisodes" }]}
      collapsed={false}
      onToggleSidebar={() => {}}
      onSearch={() => {}}
      actions={<button aria-label="Langue" />}
      mobileAccount={<button aria-label="Compte" />}
      desktopAccount={<button aria-label="Compte desktop" />}
      siteStyle={siteStyle}
      tauri={false}
      labels={SHELL_LABELS_FR}
      linkComponent="a"
    />,
  );
}

test("public search remains named with its shortcut in the icon toolbar", () => {
  const html = render(true);
  expect(html).toContain('aria-keyshortcuts="Control+K Meta+K"');
  expect(html).toContain('aria-label="Rechercher (Ctrl K)"');
  expect(html).not.toContain("<kbd");
  expect(html).toContain('aria-label="Compte desktop"');
  expect(html).toContain('aria-label="Retour : Wiki"');
});

test("application search keeps its visible label and keyboard hint", () => {
  const html = render(false);
  expect(html).toContain("<kbd");
  expect(html).toContain(">Ctrl K</kbd>");
  expect(html).not.toContain('aria-label="Compte desktop"');
});

test("translated React crumb labels keep distinct identities", () => {
  const Translation = (_props: { k: string }) => null;
  expect(shellCrumbKey({ label: <Translation k="nav.wiki" /> })).toBe("nav.wiki");
  expect(shellCrumbKey({ label: <Translation k="nav.episodes" /> })).toBe("nav.episodes");
  expect(shellCrumbKey({ href: "/wiki", label: <Translation k="nav.wiki" /> })).toBe("/wiki");
});
