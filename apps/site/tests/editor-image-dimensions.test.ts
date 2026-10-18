// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { Figure, intrinsicSize } from "../src/components/editor/nodes/blocks";

const render = (attrs: Record<string, unknown>) =>
  // The node config is plain functions; calling renderHTML needs only the node attrs.
  (Figure.config.renderHTML as unknown as (arg: unknown) => unknown[]).call(Figure, {
    node: {
      attrs: {
        src: "/a.jpg",
        alt: "",
        placement: "center",
        size: "md",
        width: null,
        height: null,
        ...attrs,
      },
    },
    HTMLAttributes: {},
  });

describe("editor figure intrinsic size", () => {
  test("accepts only positive integers", () => {
    expect(intrinsicSize("640")).toBe(640);
    expect(intrinsicSize(1280)).toBe(1280);
    expect(intrinsicSize("0")).toBeNull();
    expect(intrinsicSize("-3")).toBeNull();
    expect(intrinsicSize("auto")).toBeNull();
    expect(intrinsicSize(null)).toBeNull();
  });

  test("renders width and height on the img when known", () => {
    const html = render({ width: 800, height: 450 });
    expect(JSON.stringify(html)).toContain('"width":"800"');
    expect(JSON.stringify(html)).toContain('"height":"450"');
  });

  test("renders no dimension attributes when unknown (legacy content)", () => {
    const html = JSON.stringify(render({}));
    expect(html).not.toContain('"width"');
    expect(html).not.toContain('"height"');
  });
});
