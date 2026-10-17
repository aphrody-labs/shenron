// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DragonBall3D,
  KintoUn3D,
  type ToriyamaRenderer,
  type ToriyamaRendererFactory,
} from "../../src/toriyama/Toriyama3D";

afterEach(() => {
  cleanup();
  delete (navigator as { gpu?: unknown }).gpu;
});

const withGpu = () => Object.assign(navigator, { gpu: {} });

test("without a renderer the measured SVG is served, with its name", () => {
  const html = renderToStaticMarkup(<DragonBall3D stars={4} title="Four-star ball" />);
  expect(html).not.toContain("<canvas");
  expect(html).toContain('aria-label="Four-star ball"');
});

test("with a renderer the server HTML is a named canvas", () => {
  const factory: ToriyamaRendererFactory = () => new Promise(() => {});
  const html = renderToStaticMarkup(<KintoUn3D title="Kinto-Un" renderer={factory} />);
  expect(html).toContain("<canvas");
  expect(html).toContain('aria-label="Kinto-Un"');
});

test("the renderer receives the model and its measured parameters, then draws", async () => {
  withGpu();
  const calls: { model: string; length: number }[] = [];
  let frames = 0;
  let freed = false;
  const live: ToriyamaRenderer = {
    frame: () => {
      frames += 1;
      return true;
    },
    resize: () => {},
    free: () => {
      freed = true;
    },
  };
  const factory: ToriyamaRendererFactory = async (_canvas, model, params) => {
    calls.push({ model, length: params.length });
    return live;
  };
  const view = render(<DragonBall3D stars={7} renderer={factory} interactive={false} />);
  await waitFor(() => expect(frames).toBeGreaterThan(0));
  expect(calls).toEqual([{ model: "dragon-ball", length: 31 }]);
  view.unmount();
  expect(freed).toBe(true);
});

test("without WebGPU, a rejected renderer or a lost device, the SVG takes over", async () => {
  const never: ToriyamaRendererFactory = async () => {
    throw new Error("no adapter");
  };
  const first = render(<DragonBall3D stars={1} title="One" renderer={never} />);
  await waitFor(() => expect(first.container.querySelector("svg")).not.toBeNull());
  cleanup();

  withGpu();
  const rejected = render(<KintoUn3D title="Cloud" renderer={never} />);
  await waitFor(() => expect(rejected.container.querySelector("canvas")).toBeNull());
  cleanup();

  const lost: ToriyamaRendererFactory = async () => ({
    frame: () => false,
    resize: () => {},
    free: () => {},
  });
  const view = render(<DragonBall3D stars={2} title="Two" renderer={lost} />);
  await waitFor(() => expect(view.container.querySelector("canvas")).toBeNull());
  expect(view.container.querySelector("svg")?.getAttribute("aria-label")).toBe("Two");
});

test("a decorative model is hidden from assistive technologies", () => {
  const html = renderToStaticMarkup(
    <DragonBall3D decorative renderer={async () => new Promise(() => {})} />,
  );
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain("aria-label");
});
