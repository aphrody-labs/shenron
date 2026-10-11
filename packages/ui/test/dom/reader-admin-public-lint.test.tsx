// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { DataTable } from "../../src/admin/DataTable";
import {
  NativePipelinePanel,
  type NativePipelineLabels,
} from "../../src/admin/NativePipelinePanel";
import { EmptyState } from "../../src/public/EmptyState";
import { MangaCard } from "../../src/public/MangaCard";
import { RailSkeleton } from "../../src/public/StreamSkeleton";
import { CardListSkeleton, GridSkeleton } from "../../src/public/WikiSkeleton";

const labels: NativePipelineLabels = {
  title: "Pipeline",
  description: "Actions",
  refresh: "Refresh",
  run: "Run",
  cancel: "Cancel",
  unavailable: "Unavailable",
  empty: "Empty",
  wasm: "WASM",
  wasmReady: "Ready",
  wasmFailed: "Failed",
  states: { running: "Running" },
  categories: {},
  ragCounts: (chunks, vectors) => `${chunks}/${vectors}`,
};
const noop = () => {};

describe("reader, admin and public lint regressions", () => {
  test("pipeline statuses retain live status semantics and localized content", () => {
    const view = render(
      <NativePipelinePanel
        labels={labels}
        pending={false}
        error={false}
        wasmState="ready"
        onRun={noop}
        onCancel={noop}
        onRefresh={noop}
        onWasm={noop}
        snapshot={{
          native: { abi: null, version: null, bun: "1.4.4" },
          actions: [],
          jobs: [
            {
              id: "job",
              action: "index",
              state: "running",
              startedAt: "2026-10-11",
              finishedAt: null,
              code: null,
            },
          ],
        }}
      />,
    );
    try {
      expect(view.getAllByRole("status").map((status) => status.textContent)).toEqual([
        "Ready",
        "Running",
      ]);
      expect(view.getByRole("button", { name: "Cancel" })).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  test("selected rows remain named checkboxes with a named selection region", () => {
    const view = render(
      <DataTable
        columns={[{ key: "name", header: "Name" }]}
        rows={[{ id: 42, label: "Goku", cells: { name: "Goku" } }]}
        caption="Characters"
        selectable
        onSelectionChange={noop}
        labels={{ selectRow: "Select {row}", selected: "{count} selected" }}
      />,
    );
    try {
      const checkbox = view.getByRole("checkbox", { name: "Select Goku" });
      fireEvent.click(checkbox);
      const region = view.getByRole("region", { name: "1 selected" });
      expect(region.textContent).toContain("1 selected");
      expect((checkbox as HTMLInputElement).checked).toBe(true);
      expect(view.getByText("Goku")).toBeTruthy();
    } finally {
      cleanup();
    }
  });

  test("placeholder counts and aspect ratios survive repeated rendering", () => {
    const grid = renderToStaticMarkup(<GridSkeleton count={3} ratio="aspect-video" />);
    expect(grid.match(/aspect-video/g)).toHaveLength(3);
    expect(renderToStaticMarkup(<GridSkeleton count={3} ratio="aspect-video" />)).toBe(grid);
    expect(renderToStaticMarkup(<CardListSkeleton count={2} />).match(/rounded-xl/g)).toHaveLength(
      2,
    );
    expect(
      renderToStaticMarkup(<RailSkeleton variant="episode" />).match(/aspect-video/g),
    ).toHaveLength(8);
  });

  test("public defaults preserve empty actions and source image URLs", () => {
    expect(renderToStaticMarkup(<EmptyState title="Empty" />)).not.toContain("<a");
    expect(
      renderToStaticMarkup(<MangaCard href="/manga" title="Manga" image="/cover.png" />),
    ).toContain('src="/cover.png"');
    expect(
      renderToStaticMarkup(
        <MangaCard
          href="/manga"
          title="Manga"
          image="/cover.png"
          resolveImage={(src) => `/cdn${src}`}
        />,
      ),
    ).toContain('src="/cdn/cover.png"');
  });
});
