// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import "./dom-preload";
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
mock.module("../src/components/admin/ImageCropDialog", () => ({
  ImageCropDialog: ({ file, onConfirm }: { file: File; onConfirm: (file: File) => void }) => (
    <button type="button" onClick={() => onConfirm(file)}>
      Confirm crop fixture
    </button>
  ),
}));
const { ImageField } = await import("../src/components/admin/ImageField");
const { AdminMediaPicker } = await import("../src/components/admin/AdminMediaPicker");

test("an upload reports busy until its image path is applied and locks competing URL edits", async () => {
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const previousFetch = globalThis.fetch;
  let finish!: (response: Response) => void;
  let changed: string | undefined;
  const states: boolean[] = [];
  globalThis.fetch = Object.assign(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    { preconnect: previousFetch.preconnect },
  ) as typeof fetch;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <ImageField
          value="old.png"
          onChange={(path) => {
            changed = path;
          }}
          onUploadStateChange={(busy) => states.push(busy)}
        />,
      ),
    );
    const chooser = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(chooser, "files", {
      value: [
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "scan.bin", {
          type: "text/plain",
        }),
      ],
    });
    await act(async () => {
      chooser.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Confirm crop fixture")!
        .click(),
    );
    expect(states).toEqual([true]);
    expect(changed).toBeUndefined();
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Adresse ou chemin de l’image"]')
        ?.disabled,
    ).toBe(true);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => {
      finish(Response.json({ path: "./assets/wiki/techniques/new.png" }));
    });
    expect(changed).toBe("./assets/wiki/techniques/new.png");
    expect(states).toEqual([true, false]);
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Adresse ou chemin de l’image"]')
        ?.disabled,
    ).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = previousFetch;
    globals.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});

test("gallery browses every upload page, retries failed previews, and selects canonical CDN images", async () => {
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const oldAct = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const oldFetch = globalThis.fetch;
  const picked: string[] = [];
  const files = Array.from({ length: 121 }, (_, n) => ({
    path: `./assets/wiki/uploads/${n}.png`,
    url: `https://dragonballfr.com/assets/wiki/uploads/${n}.png`,
    name: `scan-${n}.png`,
  }));
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) =>
      String(input).includes("media-library")
        ? Response.json({
            directory: "/assets/wiki/",
            parent: "/assets/",
            revision: "a".repeat(64),
            page: 1,
            totalPages: 2,
            totalFiles: 200,
            folders: [{ name: "manga", path: "/assets/wiki/manga/" }],
            files: [
              {
                path: "/assets/wiki/real.png",
                url: "https://cdn.dragonballfr.com/assets/wiki/real.png",
                name: "real.png",
              },
            ],
          })
        : Response.json({ files }),
    { preconnect: oldFetch.preconnect },
  ) as typeof fetch;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const click = async (label: string) => {
    const button = [...container.querySelectorAll("button")].find(
      (element) => element.textContent === label,
    )!;
    expect(button).toBeDefined();
    await act(async () => button.click());
  };
  try {
    await act(async () =>
      root.render(<AdminMediaPicker onClose={() => {}} onPick={(path) => picked.push(path)} />),
    );
    expect(container.querySelectorAll("img")).toHaveLength(60);
    const image = container.querySelector("img")!;
    await act(async () => image.dispatchEvent(new Event("error")));
    expect(container.querySelector<HTMLButtonElement>('button[title="scan-0.png"]')?.disabled).toBe(
      true,
    );
    await click("Suivant");
    await click("Suivant");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    await click("Précédent");
    await click("Précédent");
    await click("Archives CDN");
    expect(container.querySelector<HTMLImageElement>("img")?.src).toBe(
      "https://cdn.dragonballfr.com/assets/wiki/real.png",
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="real.png"]')!.click(),
    );
    expect(picked).toEqual(["https://cdn.dragonballfr.com/assets/wiki/real.png"]);
    await click("Images déposées");
    expect(container.querySelector<HTMLButtonElement>('button[title="scan-0.png"]')?.disabled).toBe(
      false,
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[title="scan-0.png"]')!.click(),
    );
    expect(picked.at(-1)).toBe("./assets/wiki/uploads/0.png");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = oldFetch;
    globals.IS_REACT_ACT_ENVIRONMENT = oldAct;
  }
});
