// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MangaPage3D,
  type MangaSceneRenderer,
  type MangaSceneRendererFactory,
} from "../../src/reader/MangaPage3D";

const decode = HTMLImageElement.prototype.decode;
afterEach(() => {
  cleanup();
  delete (navigator as { gpu?: unknown }).gpu;
  HTMLImageElement.prototype.decode = decode;
});

const page = { src: "/p.jpg", alt: "Chapitre 516, page 1", width: 1662, height: 2560 };
const scene = (panels: number, onFrame?: () => void): MangaSceneRenderer => ({
  frame: () => {
    onFrame?.();
    return true;
  },
  resize: () => {},
  free: () => {},
  panels: () => new Float32Array(panels * 4),
});

test("without a renderer the flat page is served with its alternative text", () => {
  const html = renderToStaticMarkup(<MangaPage3D {...page} />);
  expect(html).toContain("<img");
  expect(html).toContain('alt="Chapitre 516, page 1"');
  expect(html).not.toContain("<canvas");
});

test("with a renderer the scene is a named canvas at the page ratio", () => {
  const html = renderToStaticMarkup(
    <MangaPage3D {...page} renderer={() => new Promise(() => {})} />,
  );
  expect(html).toContain("<canvas");
  expect(html).toContain('aria-label="Chapitre 516, page 1"');
  expect(html).toContain("aspect-ratio:1662 / 2560");
});

test("the decoded page reaches the renderer and the panels are reported", async () => {
  Object.assign(navigator, { gpu: {} });
  HTMLImageElement.prototype.decode = () => Promise.resolve();
  let frames = 0;
  let received: HTMLImageElement | null = null;
  let counted = -1;
  const factory: MangaSceneRendererFactory = async (_canvas, image) => {
    received = image;
    return scene(5, () => (frames += 1));
  };
  render(
    <MangaPage3D
      {...page}
      renderer={factory}
      interactive={false}
      onPanels={(n) => (counted = n)}
    />,
  );
  await waitFor(() => expect(frames).toBeGreaterThan(0));
  expect(counted).toBe(5);
  expect(received!.crossOrigin).toBe("anonymous");
  expect(received!.src).toContain("/p.jpg");
});

test("a page without gutters, a rejected renderer or no WebGPU keeps the flat page", async () => {
  const flat = render(<MangaPage3D {...page} renderer={async () => scene(1)} />);
  await waitFor(() => expect(flat.container.querySelector("img")).not.toBeNull());
  cleanup();

  Object.assign(navigator, { gpu: {} });
  HTMLImageElement.prototype.decode = () => Promise.resolve();
  const one = render(<MangaPage3D {...page} renderer={async () => scene(1)} />);
  await waitFor(() => expect(one.container.querySelector("img")).not.toBeNull());
  cleanup();

  const rejected = render(
    <MangaPage3D
      {...page}
      renderer={async () => {
        throw new Error("no adapter");
      }}
    />,
  );
  await waitFor(() => expect(rejected.container.querySelector("img")).not.toBeNull());
});
