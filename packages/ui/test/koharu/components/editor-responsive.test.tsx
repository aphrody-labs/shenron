// SPDX-License-Identifier: Apache-2.0
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, mock, test, vi } from "bun:test";
import userEvent from "@testing-library/user-event";

mock.module("../../../src/koharu/components/editor/ActivityCenter", () => ({
  ActivityCenter: () => null,
}));
mock.module("../../../src/koharu/components/controls/ColorSampling", () => ({
  ColorSamplingProvider: ({ children }: { children: React.ReactNode }) => children,
}));
mock.module("../../../src/koharu/components/editor/CanvasWorkspace", () => ({
  CanvasWorkspace: () => <canvas aria-label="Active project canvas" />,
}));
mock.module("../../../src/koharu/components/editor/PageRail", () => ({
  PageRail: () => <button type="button">Select current project page</button>,
}));
mock.module("../../../src/koharu/components/editor/RightSidebar", () => ({
  RightSidebar: ({
    activePanel,
    onPanelChange,
  }: {
    activePanel: string;
    onPanelChange: (panel: string) => void;
  }) => <button onClick={() => onPanelChange("shenron")}>{activePanel}</button>,
}));
const { Editor } = await import("../../../src/koharu/components/editor/Editor");
afterEach(cleanup);

// Failing jest-dom matchers serialize the whole happy-dom node, which blocks the event loop for
// several seconds while a dialog is still closing; polling a plain boolean keeps waitFor responsive.
test("compact workspace keeps one canvas while pages and tools open, and restores the chosen tool", async () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((media: string) => ({
      matches: media === "(max-width: 1023px)",
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  render(<Editor />);
  expect(document.querySelectorAll("canvas")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Pages" }));
  expect(await screen.findByRole("dialog", { name: "Pages" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Select current project page" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Tools" }));
  fireEvent.click(await screen.findByRole("button", { name: "properties" }));
  expect(screen.getByRole("button", { name: "shenron" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Tools" }));
  expect(await screen.findByRole("button", { name: "shenron" })).toBeInTheDocument();
  expect(document.querySelectorAll("canvas")).toHaveLength(1);
  // Dispatch the complete keyboard sequence from the focused control, as a user would.
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
  await waitFor(() =>
    expect(document.activeElement === screen.getByRole("button", { name: "Tools" })).toBe(true),
  );
}, 15000);
