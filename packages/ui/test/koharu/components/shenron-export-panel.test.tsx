import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "bun:test";

import { ShenronExportPanel } from "@aphrody/shenron-ui/koharu/components/ShenronExportPanel";
import { commands, type PageSummary } from "@aphrody/shenron-koharu/protocol";

const projectPages: PageSummary[] = [
  {
    id: "project-page-1",
    label: "Project page 1",
    size: { width: 1000, height: 1500 },
    source_asset: "source-1",
    layer_count: 0,
  },
  {
    id: "project-page-2",
    label: "Project page 2",
    size: { width: 1000, height: 1500 },
    source_asset: "source-2",
    layer_count: 0,
  },
];

const originalFetch = globalThis.fetch;

function installCatalogFetch() {
  let candidatePosts = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString(), "http://localhost");
    if (init?.method === "POST") candidatePosts++;
    if (url.pathname !== "/api/local/koharu/catalog") return Response.json({});
    if (!url.searchParams.has("volume")) {
      return Response.json({
        volumes: [
          { series: "DB", volume: "1", pages: 2 },
          { series: "DB", volume: "2", pages: 2 },
        ],
      });
    }
    return Response.json({
      pages: [
        { page: 1, hasJa: true, lineCount: 4, text: "Japanese OCR" },
        { page: 2, hasJa: false, lineCount: 2 },
      ],
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return () => candidatePosts;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Shenron catalog export bindings", () => {
  it("requires explicit page selection and clears bindings when the catalog volume changes", async () => {
    vi.spyOn(commands, "getPages").mockResolvedValue(projectPages);
    installCatalogFetch();

    render(<ShenronExportPanel />);

    const volume = await screen.findByRole("combobox", { name: "Target volume" });
    await waitFor(() => expect(volume).toBeEnabled());
    fireEvent.change(volume, { target: { value: "1" } });

    const pageTargets = (await screen.findAllByRole("combobox", {
      name: /Manga page for Project page/,
    })) as HTMLSelectElement[];
    await waitFor(() => expect(pageTargets[0]).toBeEnabled());
    expect(pageTargets).toHaveLength(2);
    expect(pageTargets[0]?.value).toBe("");
    expect(pageTargets[1]?.value).toBe("");

    fireEvent.change(pageTargets[0]!, { target: { value: "DB:1:2" } });
    expect(pageTargets[0]?.value).toBe("DB:1:2");

    fireEvent.change(volume, { target: { value: "2" } });
    await waitFor(() => expect(pageTargets[0]?.value).toBe(""));
    expect(pageTargets[1]?.value).toBe("");
  });

  it("does not submit a candidate without a valid source-manifest digest", async () => {
    vi.spyOn(commands, "getPages").mockResolvedValue([projectPages[0]!]);
    vi.spyOn(commands, "getPageResult");
    const candidatePosts = installCatalogFetch();

    render(<ShenronExportPanel />);

    const volume = await screen.findByRole("combobox", { name: "Target volume" });
    await waitFor(() => expect(volume).toBeEnabled());
    fireEvent.change(volume, { target: { value: "1" } });
    const target = (await screen.findByRole("combobox", {
      name: "Manga page for Project page 1",
    })) as HTMLSelectElement;
    await waitFor(() => expect(target).toBeEnabled());
    fireEvent.change(target, { target: { value: "DB:1:1" } });
    fireEvent.click(screen.getByRole("button", { name: "Export candidates" }));

    expect(
      await screen.findByText("Enter the 64-character SHA-256 digest from the manifest."),
    ).toBeInTheDocument();
    expect(candidatePosts()).toBe(0);
    expect(commands.getPageResult).not.toHaveBeenCalled();
  });
});
