// SPDX-License-Identifier: Apache-2.0
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "bun:test";
import { ToolBar } from "../../../src/koharu/components/editor/ToolBar";
import { StatusBar } from "../../../src/koharu/components/editor/StatusBar";
import { pageKey, queryClient } from "../../../src/koharu/lib/queries";
import { useKoharuStore } from "../../../src/koharu/lib/store";

afterEach(cleanup);
test("touch toolbar keeps every canonical tool and brush controls, and zoom remains operable", () => {
  queryClient.setQueryData(pageKey, {
    id: "actual-source-page",
    label: "Page 1",
    size: { width: 1662, height: 2560 },
    layers: [],
    regions: [],
  });
  const zoom = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToolBar />
      <StatusBar onZoomChange={zoom} />
    </QueryClientProvider>,
  );
  for (const name of ["Select", "Text", "Brush", "Eraser", "Color picker", "Remove", "Pan"])
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Brush" }));
  expect(useKoharuStore.getState().tool).toBe("draw");
  expect(screen.getByRole("button", { name: /Brush size:/ })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("slider", { name: "Zoom" }), { key: "ArrowRight" });
  expect(zoom).toHaveBeenCalled();
  expect(screen.getByText("1662 × 2560 px")).toBeInTheDocument();
});
