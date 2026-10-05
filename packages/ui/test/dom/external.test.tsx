// SPDX-License-Identifier: Apache-2.0
// openExternal et ExternalLink : navigateur (nouvel onglet sûr) et Tauri simulé (mockIPC).
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { clearMocks, mockIPC } from "@aphrody/api/mocks";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ExternalLink,
  ExternalLinkBridge,
  isExternalHref,
  openExternal,
  safeExternalUrl,
} from "../../src/external";

type Call = { cmd: string; payload: unknown };
let calls: Call[] = [];
const realOpen = globalThis.open;
let opened: Array<[string | URL | undefined, string | undefined, string | undefined]> = [];

function simulateTauri(fail = false) {
  mockIPC((cmd, payload) => {
    calls.push({ cmd, payload });
    if (fail) throw new Error("opener:default absent");
    return null;
  });
}

beforeEach(() => {
  calls = [];
  opened = [];
  globalThis.open = mock((url?: string | URL, target?: string, features?: string) => {
    opened.push([url, target, features]);
    return null;
  }) as unknown as typeof globalThis.open;
});

afterEach(() => {
  cleanup();
  clearMocks();
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  globalThis.open = realOpen;
});

describe("safeExternalUrl / isExternalHref", () => {
  test("only http(s) and mailto pass", () => {
    expect(safeExternalUrl("https://dragonballfr.com/wiki")?.href).toBe(
      "https://dragonballfr.com/wiki",
    );
    expect(safeExternalUrl("mailto:contact@dragonballfr.com")).not.toBeNull();
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "/wiki"])
      expect(safeExternalUrl(bad)).toBeNull();
  });

  test("same origin and relative paths are not external", () => {
    expect(isExternalHref("https://example.org/a", "https://dragonballfr.com")).toBe(true);
    expect(isExternalHref("https://dragonballfr.com/a", "https://dragonballfr.com")).toBe(false);
    expect(isExternalHref("/wiki/goku", "https://dragonballfr.com")).toBe(false);
    expect(isExternalHref("mailto:a@b.c", "https://dragonballfr.com")).toBe(true);
  });
});

describe("openExternal", () => {
  test("browser: new tab without opener nor referrer", async () => {
    expect(await openExternal("https://www.shueisha.co.jp/")).toBe("browser");
    expect(opened).toEqual([["https://www.shueisha.co.jp/", "_blank", "noopener,noreferrer"]]);
  });

  test("refuses dangerous schemes everywhere", async () => {
    expect(await openExternal("javascript:alert(1)")).toBe("refused");
    simulateTauri();
    expect(await openExternal("file:///etc/passwd")).toBe("refused");
    expect(calls).toEqual([]);
    expect(opened).toEqual([]);
  });

  test("Tauri: hands the URL to the system browser through plugin-opener", async () => {
    simulateTauri();
    expect(await openExternal("https://github.com/koharu-rs/koharu")).toBe("native");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe("plugin:opener|open_url");
    expect(calls[0]?.payload).toMatchObject({ url: "https://github.com/koharu-rs/koharu" });
    expect(opened).toEqual([]);
  });

  test("Tauri without the opener permission falls back to the WebView", async () => {
    simulateTauri(true);
    expect(await openExternal("https://example.org/")).toBe("browser");
    expect(opened).toHaveLength(1);
  });
});

describe("<ExternalLink>", () => {
  test("browser: a real link, new tab, safe rel, screen-reader hint", () => {
    render(
      <ExternalLink href="https://example.org/" rel="me" newTabHint="(nouvel onglet)">
        Source
      </ExternalLink>,
    );
    const link = screen.getByRole("link", { name: "Source (nouvel onglet)" });
    expect(link.getAttribute("href")).toBe("https://example.org/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer me");
    // Le clic reste celui du navigateur : rien n'est intercepté.
    expect(fireEvent.click(link)).toBe(true);
    expect(opened).toEqual([]);
  });

  test("Tauri: click and middle click go to the system browser", async () => {
    simulateTauri();
    render(<ExternalLink href="https://example.org/">Source</ExternalLink>);
    const link = screen.getByRole("link", { name: "Source" });
    expect(fireEvent.click(link)).toBe(false);
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
    await Bun.sleep(0);
    await Bun.sleep(0);
    expect(calls.map((call) => call.cmd)).toEqual([
      "plugin:opener|open_url",
      "plugin:opener|open_url",
    ]);
  });

  test("an unsafe scheme renders no link", () => {
    render(<ExternalLink href="javascript:alert(1)">Piège</ExternalLink>);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Piège")).toBeTruthy();
  });
});

describe("<ExternalLinkBridge>", () => {
  test("Tauri: legacy target=_blank anchors are routed natively, internal links are not", async () => {
    simulateTauri();
    render(
      <>
        <ExternalLinkBridge />
        <a href="https://example.org/legacy" target="_blank" rel="noreferrer">
          Hérité
        </a>
        <a href="/wiki/goku">Interne</a>
      </>,
    );
    expect(fireEvent.click(screen.getByRole("link", { name: "Hérité" }))).toBe(false);
    const internal = screen.getByRole("link", { name: "Interne" });
    internal.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(internal);
    await Bun.sleep(0);
    await Bun.sleep(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toMatchObject({ url: "https://example.org/legacy" });
  });

  test("browser: the bridge stays inert", () => {
    render(
      <>
        <ExternalLinkBridge />
        <a href="https://example.org/" target="_blank" rel="noreferrer">
          Lien
        </a>
      </>,
    );
    expect(fireEvent.click(screen.getByRole("link", { name: "Lien" }))).toBe(true);
  });
});
