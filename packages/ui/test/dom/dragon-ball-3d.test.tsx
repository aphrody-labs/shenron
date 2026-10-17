// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { DragonBall3D } from "../../src/toriyama/DragonBall3D";

afterEach(cleanup);

test("the server HTML is a named canvas", () => {
  const html = renderToStaticMarkup(<DragonBall3D stars={4} title="Four-star ball" />);
  expect(html).toContain("<canvas");
  expect(html).toContain('role="img"');
  expect(html).toContain('aria-label="Four-star ball"');
});

test("without WebGL2 the measured SVG ball takes over, with the same name", async () => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  const view = render(<DragonBall3D stars={1} title="One-star ball" />);
  await waitFor(() => expect(view.container.querySelector("svg")).not.toBeNull());
  expect(view.container.querySelector("canvas")).toBeNull();
  expect(view.container.querySelector("svg")?.getAttribute("aria-label")).toBe("One-star ball");
});

test("a decorative ball is hidden from assistive technologies", () => {
  const html = renderToStaticMarkup(<DragonBall3D decorative />);
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain("aria-label");
});
