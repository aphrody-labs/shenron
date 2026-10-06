// SPDX-License-Identifier: Apache-2.0
// MemoryPanel: listing, search, forgetting one fact, two-step clear, unavailable memory.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryPanel, type MemoryLabels, type MemoryTransport } from "../../src/chat";

const labels: MemoryLabels = {
  title: "Memory",
  description: "What Shenron kept",
  searchLabel: "Search the memory",
  searchPlaceholder: "Search",
  empty: "Nothing yet",
  noMatch: "No match",
  unavailable: "No memory here",
  checking: "Checking",
  remove: "Forget",
  clear: "Forget everything",
  clearConfirm: "Confirm",
  cancel: "Cancel",
  failed: "Memory failed",
  total: (n) => `${n} memories`,
  tag: (tag) => (tag === "profile" ? "Profile" : tag),
};

const facts = [
  {
    id: "mem_00000001",
    content: "Prefers Vegeta",
    tags: ["preference"],
    createdAt: "2026-10-06T10:00:00Z",
  },
  {
    id: "mem_00000002",
    content: "Lives in Lyon",
    tags: ["profile"],
    createdAt: "2026-10-06T09:00:00Z",
  },
];

function transport(): MemoryTransport {
  return {
    list: mock(async ({ q }: { q?: string }) => {
      const memories = q ? facts.filter((m) => m.content.includes(q)) : facts;
      return { memories, total: memories.length };
    }),
    remove: mock(async () => true),
    clear: mock(async () => 2),
  };
}

afterEach(cleanup);

describe("MemoryPanel", () => {
  test("lists the memories with their tags and forgets one", async () => {
    const t = transport();
    render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
    expect(await screen.findByText("Prefers Vegeta")).toBeTruthy();
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText("2 memories")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Forget: Lives in Lyon/ })),
    );
    expect(t.remove).toHaveBeenCalledWith("mem_00000002");
    expect(screen.queryByText("Lives in Lyon")).toBeNull();
    expect(screen.getByText("1 memories")).toBeTruthy();
  });

  test("searches, then clears everything after confirmation", async () => {
    const t = transport();
    render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
    await screen.findByText("Prefers Vegeta");
    fireEvent.change(screen.getByLabelText("Search the memory"), { target: { value: "Lyon" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(screen.queryByText("Prefers Vegeta")).toBeNull();
    expect(t.list).toHaveBeenLastCalledWith({ q: "Lyon" });
    fireEvent.click(screen.getByRole("button", { name: "Forget everything" }));
    expect(t.clear).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm" })));
    expect(t.clear).toHaveBeenCalledTimes(1);
    expect(screen.getByText("No match")).toBeTruthy();
  });

  test("an unavailable memory says why and reads nothing", () => {
    const t = transport();
    render(
      <MemoryPanel
        transport={t}
        labels={labels}
        memory={{ available: false, reason: "mémoire absente" }}
      />,
    );
    expect(screen.getByText("mémoire absente")).toBeTruthy();
    expect(t.list).not.toHaveBeenCalled();
  });
});
