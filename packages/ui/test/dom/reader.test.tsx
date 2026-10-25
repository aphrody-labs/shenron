// SPDX-License-Identifier: Apache-2.0
// Lecteurs : mobile (gestes de la visionneuse), desktop (double page, raccourcis) et plein écran
// Tauri simulé (mockIPC). Lancé par l'étape DOM de `bun run test` (happy-dom).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { useRef } from "react";
import { clearMocks, mockIPC, mockWindows } from "@aphrody/api/mocks";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  DatabookReader,
  MangaReader,
  ZOOM_IDENTITY,
  clampZoom,
  useTauriFullscreen,
  zoomAround,
} from "../../src/reader";

type Call = { cmd: string; payload: unknown };
let calls: Call[] = [];
let windowFullscreen = false;
let desktop = false;

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function simulateTauri({ refuse = false } = {}) {
  mockWindows("main");
  mockIPC((cmd, payload) => {
    calls.push({ cmd, payload });
    if (cmd === "plugin:window|is_fullscreen") return windowFullscreen;
    if (cmd === "plugin:window|set_fullscreen") {
      if (refuse) throw new Error("core:window:allow-set-fullscreen absent");
      windowFullscreen = Boolean((payload as { value?: boolean }).value);
      return null;
    }
    return null;
  });
}

const fullscreenCalls = () =>
  calls
    .filter((call) => call.cmd === "plugin:window|set_fullscreen")
    .map((call) => (call.payload as { value: boolean }).value);

/** Laisse passer les imports dynamiques et les promesses IPC. */
async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => Bun.sleep(0));
}

let fullscreenElement: Element | null = null;

beforeEach(() => {
  calls = [];
  windowFullscreen = false;
  desktop = false;
  fullscreenElement = null;
  Object.defineProperty(globalThis, "ResizeObserver", { value: NoopObserver, configurable: true });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  window.matchMedia = ((query: string) => ({
    matches: desktop && query.includes("min-width: 1024px"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  clearMocks();
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

const pages = [1, 2, 3, 4, 5].map((n) => ({
  number: n,
  image: `/scans/db-${n}.webp`,
  text: `Légende de la planche ${n}`,
}));

function badge(reader: HTMLElement) {
  return within(reader).getAllByText(/^n° \d+$/)[0]?.textContent;
}

describe("zoom geometry", () => {
  test("clamps the scale to [1, 4] and keeps the zoomed page against the edges", () => {
    const bounds = { width: 400, height: 600 };
    expect(clampZoom({ scale: 0.5, x: 30, y: 30 }, bounds)).toEqual(ZOOM_IDENTITY);
    expect(clampZoom({ scale: 9, x: 0, y: 0 }, bounds).scale).toBe(4);
    // À 2×, la planche déborde de 200 px de chaque côté horizontalement.
    expect(clampZoom({ scale: 2, x: 999, y: -999 }, bounds)).toEqual({ scale: 2, x: 200, y: -300 });
  });

  test("zooming around a point keeps that point under the finger", () => {
    const bounds = { width: 400, height: 600 };
    const focus = { x: 100, y: -50 };
    const next = zoomAround(ZOOM_IDENTITY, 2, focus, bounds);
    // Point de l'image sous le doigt avant et après : (focus - t) / s.
    expect((focus.x - next.x) / next.scale).toBeCloseTo(focus.x);
    expect((focus.y - next.y) / next.scale).toBeCloseTo(focus.y);
  });
});

describe("useTauriFullscreen", () => {
  function Probe() {
    const scope = useRef<HTMLDivElement>(null);
    useTauriFullscreen(scope);
    return (
      <div ref={scope}>
        <div data-testid="inner" />
      </div>
    );
  }

  test("Tauri: the window follows the DOM fullscreen of the scope, then is restored", async () => {
    simulateTauri();
    render(<Probe />);
    fullscreenElement = screen.getByTestId("inner");
    document.dispatchEvent(new Event("fullscreenchange"));
    await settle();
    expect(fullscreenCalls()).toEqual([true]);
    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    await settle();
    expect(fullscreenCalls()).toEqual([true, false]);
  });

  test("Tauri: a window already fullscreen (F11) is left alone", async () => {
    simulateTauri();
    windowFullscreen = true;
    render(<Probe />);
    fullscreenElement = screen.getByTestId("inner");
    document.dispatchEvent(new Event("fullscreenchange"));
    await settle();
    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    await settle();
    expect(fullscreenCalls()).toEqual([]);
  });

  test("Tauri: a delayed native entry is restored after reader disposal or DOM exit", async () => {
    for (const dispose of [true, false]) {
      calls = [];
      let finish!: () => void;
      mockWindows("main");
      mockIPC((cmd, payload) => {
        calls.push({ cmd, payload });
        if (cmd === "plugin:window|is_fullscreen") return windowFullscreen;
        if (cmd === "plugin:window|set_fullscreen") {
          const enter = Boolean((payload as { value?: boolean }).value);
          if (!enter) {
            windowFullscreen = false;
            return null;
          }
          return new Promise<null>((resolve) => {
            finish = () => {
              windowFullscreen = true;
              resolve(null);
            };
          });
        }
        return null;
      });
      const { unmount } = render(<Probe />);
      fullscreenElement = screen.getByTestId("inner");
      document.dispatchEvent(new Event("fullscreenchange"));
      await settle();
      // Repeated notifications must not launch another native entry in flight.
      document.dispatchEvent(new Event("fullscreenchange"));
      if (dispose) unmount();
      else {
        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      }
      await settle();
      finish();
      await settle();
      expect(fullscreenCalls()).toEqual([true, false]);
      expect(windowFullscreen).toBe(false);
      if (!dispose) unmount();
      fullscreenElement = null;
      await settle();
    }
  });

  test("Tauri: elements outside the scope and a refused permission stay silent", async () => {
    simulateTauri({ refuse: true });
    render(<Probe />);
    const outside = document.createElement("video");
    document.body.append(outside);
    fullscreenElement = outside;
    document.dispatchEvent(new Event("fullscreenchange"));
    await settle();
    expect(fullscreenCalls()).toEqual([]);
    fullscreenElement = screen.getByTestId("inner");
    document.dispatchEvent(new Event("fullscreenchange"));
    await settle();
    // Tentée puis refusée : aucune exception ne remonte au lecteur.
    expect(fullscreenCalls()).toEqual([true]);
    outside.remove();
  });

  test("browser: nothing is sent", async () => {
    render(<Probe />);
    fullscreenElement = screen.getByTestId("inner");
    document.dispatchEvent(new Event("fullscreenchange"));
    await settle();
    expect(calls).toEqual([]);
  });
});

describe("DatabookReader on a phone", () => {
  function openViewer() {
    render(<DatabookReader pages={pages} title="Daizenshuu 2" />);
    const reader = screen.getByTestId("databook-reader");
    fireEvent.click(within(reader).getByRole("button", { name: "Mode paginé" }));
    fireEvent.click(within(reader).getByRole("button", { name: "Agrandir la planche" }));
    const dialog = screen.getByRole("dialog");
    const surface = within(dialog).getByTestId("databook-lightbox-surface");
    surface.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 600,
        right: 400,
        bottom: 600,
        x: 0,
        y: 0,
      }) as DOMRect;
    return { reader, dialog, surface };
  }

  const pointer = (
    target: Element,
    type: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel" | "lostPointerCapture",
    id: number,
    x: number,
    y = 300,
  ) => fireEvent[type](target, { pointerId: id, clientX: x, clientY: y, pointerType: "touch" });

  test("no double page and no hover-only hint: the enlarge hint shows to the finger", () => {
    render(<DatabookReader pages={pages} title="Daizenshuu 2" />);
    const reader = screen.getByTestId("databook-reader");
    fireEvent.click(within(reader).getByRole("button", { name: "Mode paginé" }));
    expect(within(reader).queryByRole("button", { name: "Double page" })).toBeNull();
    const hint = within(reader).getAllByText("Agrandir")[0]!;
    expect(hint.className).toContain("pointer-coarse:opacity-100");
  });

  test("swiping the viewer turns the page", () => {
    const { reader, surface } = openViewer();
    expect(badge(reader)).toBe("n° 1");
    pointer(surface, "pointerDown", 1, 320);
    pointer(surface, "pointerMove", 1, 200);
    pointer(surface, "pointerUp", 1, 120);
    expect(badge(reader)).toBe("n° 2");
    pointer(surface, "pointerDown", 2, 80);
    pointer(surface, "pointerUp", 2, 300);
    expect(badge(reader)).toBe("n° 1");
  });

  test("double tap zooms in at the finger, then back to fit", () => {
    const { surface } = openViewer();
    const image = surface.querySelector("img")!;
    pointer(surface, "pointerDown", 1, 250, 200);
    pointer(surface, "pointerUp", 1, 250, 200);
    pointer(surface, "pointerDown", 2, 252, 201);
    pointer(surface, "pointerUp", 2, 252, 201);
    expect(surface.hasAttribute("data-zoomed")).toBe(true);
    expect(image.style.transform).toContain("scale(2.5)");
    pointer(surface, "pointerDown", 3, 252, 201);
    pointer(surface, "pointerUp", 3, 252, 201);
    pointer(surface, "pointerDown", 4, 252, 201);
    pointer(surface, "pointerUp", 4, 252, 201);
    expect(surface.hasAttribute("data-zoomed")).toBe(false);
  });

  test("two quick taps far apart are separate taps, not a double tap", () => {
    const { surface } = openViewer();
    pointer(surface, "pointerDown", 1, 60, 80);
    pointer(surface, "pointerUp", 1, 60, 80);
    pointer(surface, "pointerDown", 2, 340, 500);
    pointer(surface, "pointerUp", 2, 340, 500);
    expect(surface.hasAttribute("data-zoomed")).toBe(false);
  });

  test("changing pages abandons the active drag before another finger starts", () => {
    const { reader, dialog, surface } = openViewer();
    pointer(surface, "pointerDown", 1, 320);
    fireEvent.click(within(dialog).getByRole("button", { name: "Page suivante" }));
    expect(badge(reader)).toBe("n° 2");
    pointer(surface, "pointerDown", 2, 100);
    pointer(surface, "pointerMove", 2, 300);
    pointer(surface, "pointerUp", 2, 320);
    expect(badge(reader)).toBe("n° 1");
    expect(surface.hasAttribute("data-zoomed")).toBe(false);
  });

  test("resetting during a drag keeps the page fitted when that finger moves again", () => {
    const { reader, dialog, surface } = openViewer();
    fireEvent.click(within(dialog).getByRole("button", { name: "Zoomer" }));
    pointer(surface, "pointerDown", 1, 300);
    fireEvent.click(within(dialog).getByRole("button", { name: "Taille réelle de l'écran" }));
    pointer(surface, "pointerMove", 1, 100);
    pointer(surface, "pointerUp", 1, 100);
    expect(surface.hasAttribute("data-zoomed")).toBe(false);
    expect(badge(reader)).toBe("n° 1");
  });

  test("lost capture and cancellation end the gesture without navigating", () => {
    for (const event of ["lostPointerCapture", "pointerCancel"] as const) {
      const { reader, surface } = openViewer();
      pointer(surface, "pointerDown", 1, 320);
      pointer(surface, event, 1, 320);
      pointer(surface, "pointerDown", 2, 320);
      pointer(surface, "pointerMove", 2, 100);
      pointer(surface, "pointerUp", 2, 100);
      expect(badge(reader)).toBe("n° 2");
      cleanup();
    }
  });

  test("a pinch ending at fit cannot turn into a swipe or double tap", () => {
    const { reader, surface } = openViewer();
    pointer(surface, "pointerDown", 1, 100);
    pointer(surface, "pointerDown", 2, 300);
    pointer(surface, "pointerUp", 1, 100);
    pointer(surface, "pointerUp", 2, 300);
    pointer(surface, "pointerDown", 3, 300);
    pointer(surface, "pointerUp", 3, 300);
    expect(badge(reader)).toBe("n° 1");
    expect(surface.hasAttribute("data-zoomed")).toBe(false);
  });

  test("pinching zooms, a zoomed page pans instead of turning", () => {
    const { reader, surface } = openViewer();
    const image = surface.querySelector("img")!;
    pointer(surface, "pointerDown", 1, 150);
    pointer(surface, "pointerDown", 2, 250);
    pointer(surface, "pointerMove", 2, 350);
    pointer(surface, "pointerMove", 1, 50);
    pointer(surface, "pointerUp", 1, 50);
    pointer(surface, "pointerUp", 2, 350);
    expect(image.style.transform).toContain("scale(3)");
    // Agrandie, la planche se déplace sous le doigt : pas de changement de page.
    pointer(surface, "pointerDown", 3, 300);
    pointer(surface, "pointerMove", 3, 150);
    pointer(surface, "pointerUp", 3, 150);
    expect(badge(reader)).toBe("n° 1");
    expect(image.style.transform).not.toContain("translate3d(0px, 0px, 0)");
  });

  test("zoom buttons reach 400 % and reset; arrows inside the viewer are not gestures", () => {
    const { dialog, surface } = openViewer();
    const zoomIn = within(dialog).getByRole("button", { name: "Zoomer" });
    for (let i = 0; i < 10; i++) fireEvent.click(zoomIn);
    expect(surface.querySelector("img")!.style.transform).toContain("scale(4)");
    expect((zoomIn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(window, { key: "0" });
    expect(surface.hasAttribute("data-zoomed")).toBe(false);
    const next = within(dialog).getByRole("button", { name: "Page suivante" });
    pointer(next, "pointerDown", 7, 380);
    pointer(next, "pointerUp", 7, 380);
    pointer(next, "pointerDown", 8, 380);
    pointer(next, "pointerUp", 8, 380);
    expect(surface.hasAttribute("data-zoomed")).toBe(false);
  });
});

describe("DatabookReader on a desktop", () => {
  test("paged navigation leaves keyboard events outside the reader alone", () => {
    desktop = true;
    render(
      <>
        <button type="button">Outside reader</button>
        <select aria-label="Catalogue filter">
          <option>Guide</option>
        </select>
        <DatabookReader pages={pages} title="Daizenshuu 2" />
      </>,
    );
    const reader = screen.getByTestId("databook-reader");
    const mode = within(reader).getByRole("button", { name: "Mode paginé" });
    fireEvent.click(mode);
    fireEvent.keyDown(screen.getByRole("button", { name: "Outside reader" }), { key: "End" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowRight" });
    expect(badge(reader)).toBe("n° 1");
    fireEvent.keyDown(mode, { key: "ArrowRight" });
    expect(badge(reader)).toBe("n° 2");
  });

  test("double page on lg+, toggled by its button and by D, arrows turn two pages", () => {
    desktop = true;
    render(<DatabookReader pages={pages} title="Daizenshuu 2" />);
    const reader = screen.getByTestId("databook-reader");
    fireEvent.click(within(reader).getByRole("button", { name: "Mode paginé" }));
    const spread = within(reader).getByRole("button", { name: "Double page" });
    expect(spread.getAttribute("aria-keyshortcuts")).toBe("D");
    fireEvent.click(spread);
    expect(spread.getAttribute("aria-pressed")).toBe("true");
    expect(reader.hasAttribute("data-spread")).toBe(true);
    fireEvent.keyDown(spread, { key: "ArrowRight" });
    expect(badge(reader)).toBe("n° 3");
    // D ne s'applique qu'au lecteur qui a le focus.
    spread.focus();
    fireEvent.keyDown(spread, { key: "d" });
    expect(reader.hasAttribute("data-spread")).toBe(false);
    fireEvent.keyDown(document.body, { key: "d" });
    expect(reader.hasAttribute("data-spread")).toBe(false);
  });

  test("browser without the Fullscreen API: no dead fullscreen button", () => {
    desktop = true;
    render(<DatabookReader pages={pages} title="Daizenshuu 2" />);
    expect(screen.queryByRole("button", { name: "Activer le plein écran" })).toBeNull();
  });

  test("Tauri: F pins the reader over the window and makes the window fullscreen; Escape leaves", async () => {
    desktop = true;
    simulateTauri();
    render(<DatabookReader pages={pages} title="Daizenshuu 2" />);
    await settle();
    const reader = screen.getByTestId("databook-reader");
    const button = within(reader).getByRole("button", { name: "Activer le plein écran" });
    expect(button.getAttribute("aria-keyshortcuts")).toBe("F");
    button.focus();
    fireEvent.keyDown(button, { key: "f" });
    await settle();
    expect(reader.hasAttribute("data-pinned-fullscreen")).toBe(true);
    expect(fullscreenCalls()).toEqual([true]);
    expect(within(reader).getByRole("button", { name: "Quitter le plein écran" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await settle();
    expect(reader.hasAttribute("data-pinned-fullscreen")).toBe(false);
    expect(fullscreenCalls()).toEqual([true, false]);
  });
});

describe("MangaReader (M3) inside the Tauri window", () => {
  test("its DOM fullscreen takes the whole native window", async () => {
    simulateTauri();
    render(<MangaReader pages={["/a.webp", "/b.webp"]} title="Chapitre 1" />);
    const canonical = screen.getByTestId("manga-reader");
    expect(canonical.closest('[data-shenron-reader="manga"]')).not.toBeNull();
    fullscreenElement = canonical;
    document.dispatchEvent(new Event("fullscreenchange"));
    await settle();
    expect(fullscreenCalls()).toEqual([true]);
  });
});
