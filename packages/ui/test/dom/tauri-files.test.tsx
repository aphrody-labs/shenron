// SPDX-License-Identifier: Apache-2.0
// Pont de fichiers du studio : dialogues natifs dans Tauri simulé (mockIPC), sélecteurs du
// navigateur ailleurs, et repli navigateur quand un plugin natif manque.
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { clearMocks, mockIPC } from "@aphrody/api/mocks";
import {
  acceptAttribute,
  browserOpenFiles,
  nativeOpenDialog,
  nativeSaveDialog,
  openFiles,
  readPickedFile,
  saveFile,
} from "../../src/studio/tauri-bridge";

type Call = { cmd: string; payload: unknown };
let calls: Call[] = [];
const host = globalThis as unknown as Record<string, unknown>;

function simulateTauri(handlers: Record<string, (payload: unknown) => unknown>) {
  mockIPC((cmd, payload) => {
    calls.push({ cmd, payload });
    const handler = handlers[cmd];
    if (!handler) throw new Error(`plugin absent: ${cmd}`);
    return handler(payload);
  });
}

/** Capte le prochain `<input type="file">` éphémère ajouté au document. */
function nextFileInput(): Promise<HTMLInputElement> {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const input = document.body.querySelector<HTMLInputElement>("input[type=file]");
      if (input) {
        observer.disconnect();
        resolve(input);
      }
    });
    observer.observe(document.body, { childList: true });
  });
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  clearMocks();
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  delete host.showOpenFilePicker;
  delete host.showSaveFilePicker;
  document.body.innerHTML = "";
});

describe("native dialogs (Tauri simulé)", () => {
  test("open returns the chosen paths with the filters handed to the plugin", async () => {
    simulateTauri({ "plugin:dialog|open": () => ["/scans/p001.png", "C:\\scans\\p002.jpg"] });
    const picked = await openFiles({
      multiple: true,
      filters: [{ name: "Images", extensions: ["png", "jpg"] }],
    });
    expect(picked).toEqual([
      { source: "native", name: "p001.png", path: "/scans/p001.png" },
      { source: "native", name: "p002.jpg", path: "C:\\scans\\p002.jpg" },
    ]);
    expect(calls[0]?.payload).toMatchObject({
      options: { multiple: true, filters: [{ name: "Images", extensions: ["png", "jpg"] }] },
    });
  });

  test("a dismissed dialog is a cancellation, not a browser fallback", async () => {
    simulateTauri({ "plugin:dialog|open": () => null, "plugin:dialog|save": () => null });
    expect(await nativeOpenDialog()).toEqual({ status: "cancelled" });
    expect(await openFiles()).toEqual([]);
    expect(await saveFile("x", { suggestedName: "a.txt" })).toEqual({ status: "cancelled" });
    expect(document.body.querySelector("input, a")).toBeNull();
  });

  test("save writes the bytes through the fs plugin at the chosen path", async () => {
    simulateTauri({
      "plugin:dialog|save": () => "/home/goku/reponse.md",
      "plugin:fs|write_file": () => null,
    });
    const result = await saveFile("# Réponse", {
      suggestedName: "reponse.md",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    expect(result).toEqual({ status: "native", path: "/home/goku/reponse.md" });
    expect(calls.map((call) => call.cmd)).toEqual(["plugin:dialog|save", "plugin:fs|write_file"]);
    expect(new TextDecoder().decode(calls[1]?.payload as Uint8Array)).toBe("# Réponse");
    expect(calls[0]?.payload).toMatchObject({ options: { defaultPath: "reponse.md" } });
  });

  test("native reads go through plugin:fs|read_file", async () => {
    simulateTauri({ "plugin:fs|read_file": () => [1, 2, 3] });
    const bytes = await readPickedFile({ source: "native", name: "a.bin", path: "/a.bin" });
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  test("without the dialog plugin, the browser picker takes over", async () => {
    simulateTauri({});
    expect(await nativeSaveDialog({ suggestedName: "a.txt" })).toEqual({ status: "unavailable" });
    const file = new File(["png"], "p001.png", { type: "image/png" });
    host.showOpenFilePicker = async () => [{ name: file.name, getFile: async () => file }];
    expect(await openFiles()).toEqual([{ source: "browser", name: "p001.png", file }]);
  });
});

describe("browser pickers", () => {
  test("file input: accept from the filters, files on change, nothing on cancel", async () => {
    expect(acceptAttribute([{ name: "Images", extensions: ["png", "webp"] }])).toBe(".png,.webp");
    const click = spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    try {
      const file = new File(["x"], "planche.webp");
      const appearing = nextFileInput();
      const picking = browserOpenFiles({
        multiple: true,
        filters: [{ name: "Images", extensions: ["png", "webp"] }],
      });
      const input = await appearing;
      expect(input.accept).toBe(".png,.webp");
      expect(input.multiple).toBe(true);
      Object.defineProperty(input, "files", { value: [file] });
      input.dispatchEvent(new Event("change"));
      expect(await picking).toEqual([file]);
      expect(document.body.querySelector("input")).toBeNull();

      const again = nextFileInput();
      const cancelled = browserOpenFiles();
      (await again).dispatchEvent(new Event("cancel"));
      expect(await cancelled).toEqual([]);
    } finally {
      click.mockRestore();
    }
  });

  test("showOpenFilePicker: an aborted picker returns no file", async () => {
    host.showOpenFilePicker = async () => {
      throw new DOMException("dismissed", "AbortError");
    };
    expect(await browserOpenFiles()).toEqual([]);
  });

  test("save: showSaveFilePicker writes the blob, otherwise a download link", async () => {
    const written: Blob[] = [];
    host.showSaveFilePicker = async (options: unknown) => {
      expect(options).toMatchObject({
        suggestedName: "reponse.md",
        types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }],
      });
      return {
        name: "reponse.md",
        createWritable: async () => ({
          write: async (blob: Blob) => void written.push(blob),
          close: async () => undefined,
        }),
      };
    };
    const options = {
      suggestedName: "reponse.md",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    };
    expect(await saveFile("texte", options)).toEqual({ status: "browser", name: "reponse.md" });
    expect(await written[0]?.text()).toBe("texte");

    delete host.showSaveFilePicker;
    const clicked: HTMLAnchorElement[] = [];
    const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    try {
      expect(await saveFile("texte", options)).toEqual({ status: "browser", name: "reponse.md" });
      expect(clicked[0]?.download).toBe("reponse.md");
      expect(clicked[0]?.href.startsWith("blob:")).toBe(true);
    } finally {
      click.mockRestore();
    }
  });
});
