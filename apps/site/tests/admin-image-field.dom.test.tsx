// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ImageField } from "../src/components/admin/ImageField";

test.skipIf(typeof document === "undefined")(
  "an upload reports busy until its image path is applied and locks competing URL edits",
  async () => {
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
      expect(states).toEqual([true]);
      expect(changed).toBeUndefined();
      expect(
        container.querySelector<HTMLInputElement>(
          'input[aria-label="Adresse ou chemin de l’image"]',
        )?.disabled,
      ).toBe(true);
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
      await act(async () => {
        finish(Response.json({ path: "./assets/wiki/techniques/new.png" }));
      });
      expect(changed).toBe("./assets/wiki/techniques/new.png");
      expect(states).toEqual([true, false]);
      expect(
        container.querySelector<HTMLInputElement>(
          'input[aria-label="Adresse ou chemin de l’image"]',
        )?.disabled,
      ).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globalThis.fetch = previousFetch;
      globals.IS_REACT_ACT_ENVIRONMENT = previousAct;
    }
  },
);
