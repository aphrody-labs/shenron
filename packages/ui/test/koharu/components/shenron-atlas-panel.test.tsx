// SPDX-License-Identifier: Apache-2.0

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "bun:test";
import { commands, type Page } from "@aphrody/shenron-koharu/protocol";
import { ShenronAtlasPanel } from "../../../src/koharu/components/ShenronAtlasPanel";
import { AtlasPreviewContext, type AtlasPreview } from "../../../src/koharu/lib/atlas-preview";
import { pageKey, queryClient } from "../../../src/koharu/lib/queries";

const hash = "a".repeat(64);
const page: Page = {
  id: "open-page",
  label: "Page 1",
  size: { width: 1000, height: 1500 },
  layers: [],
  regions: [],
};

afterEach(cleanup);

function setup() {
  queryClient.setQueryData(pageKey, page);
  const clip: AtlasPreview = {
    frameCount: 2,
    fps: 2,
    width: 256,
    height: 256,
    draw: vi.fn((_canvas, elapsedMs) => Math.floor(elapsedMs / 500) % 2),
    close: vi.fn(),
  };
  const renderer = vi.fn(async () => clip);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AtlasPreviewContext.Provider value={renderer}>
        <ShenronAtlasPanel />
      </AtlasPreviewContext.Provider>
    </QueryClientProvider>,
  );
  const source = JSON.stringify({ source: { sha256: hash, ...page.size } });
  fireEvent.change(screen.getByLabelText("Atlas manifest (JSON)"), {
    target: { files: [new File([source], "sheet.layout.json", { type: "application/json" })] },
  });
  fireEvent.change(screen.getByLabelText("Panel atlas (PNG)"), {
    target: { files: [new File(["png"], "sheet.png", { type: "image/png" })] },
  });
  return { view, clip, renderer };
}

test("opens only an atlas matching the native active page and releases it when the page changes", async () => {
  const getHash = vi.spyOn(commands, "getPageSourceSha256").mockResolvedValue(hash);
  const { clip, renderer } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Open atlas" }));
  await screen.findByText("Source verified: Page 1");
  expect(getHash).toHaveBeenCalledWith("open-page");
  expect(renderer).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Next frame" }));
  expect(screen.getByRole("img", { name: "Frame 2 of 2" })).toBeInTheDocument();
  expect(clip.draw).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), 500);
  act(() => {
    queryClient.setQueryData(pageKey, { ...page, id: "another-page", label: "Page 2" });
  });
  await waitFor(() => expect(clip.close).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Source verified: Page 1")).toBeNull();
});

test("refuses a different native source before decoding or displaying its atlas", async () => {
  vi.spyOn(commands, "getPageSourceSha256").mockResolvedValue("b".repeat(64));
  const { renderer } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Open atlas" }));
  await screen.findByRole("alert");
  expect(renderer).not.toHaveBeenCalled();
  expect(screen.queryByRole("img")).toBeNull();
});

test("manual playback pauses when the Studio tab becomes hidden", async () => {
  vi.spyOn(commands, "getPageSourceSha256").mockResolvedValue(hash);
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Open atlas" }));
  await screen.findByText("Source verified: Page 1");
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");
  const hidden = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  try {
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false"),
    );
  } finally {
    if (hidden) Object.defineProperty(document, "hidden", hidden);
    else Reflect.deleteProperty(document, "hidden");
  }
});
