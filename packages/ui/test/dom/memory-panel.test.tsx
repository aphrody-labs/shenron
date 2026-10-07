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

  test("an older search cannot replace the latest results", async () => {
    const older = Promise.withResolvers<{ memories: typeof facts; total: number } | null>();
    const newer = Promise.withResolvers<{ memories: typeof facts; total: number } | null>();
    const t = transport();
    t.list = mock(async ({ q }) => {
      if (q === "Vegeta") return older.promise;
      if (q === "Lyon") return newer.promise;
      return { memories: facts, total: facts.length };
    });
    render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
    await screen.findByText("Prefers Vegeta");
    fireEvent.change(screen.getByLabelText("Search the memory"), { target: { value: "Vegeta" } });
    await act(async () => {
      await Bun.sleep(300);
    });
    expect(t.list).toHaveBeenLastCalledWith({ q: "Vegeta" });
    fireEvent.change(screen.getByLabelText("Search the memory"), { target: { value: "Lyon" } });
    await act(async () => {
      await Bun.sleep(300);
    });
    expect(t.list).toHaveBeenLastCalledWith({ q: "Lyon" });
    await act(async () => newer.resolve({ memories: [facts[1]!], total: 1 }));
    expect(screen.getByText("Lives in Lyon")).toBeTruthy();
    await act(async () => older.resolve({ memories: [facts[0]!], total: 1 }));
    expect(screen.getByText("Lives in Lyon")).toBeTruthy();
    expect(screen.queryByText("Prefers Vegeta")).toBeNull();
  });
});

test("a rejected removal releases the controls and preserves the memory", async () => {
  const t = transport();
  t.remove = mock().mockRejectedValueOnce(Error("private detail")).mockResolvedValue(true);
  render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
  const button = await screen.findByRole("button", { name: /Forget: Lives in Lyon/ });
  await act(async () => fireEvent.click(button));
  expect(await screen.findByText(labels.failed)).toBeTruthy();
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText("Lives in Lyon")).toBeTruthy();
  await act(async () => fireEvent.click(button));
  expect(screen.queryByText("Lives in Lyon")).toBeNull();
  expect(screen.queryByText(labels.failed)).toBeNull();
});

test("a rejected clear can be confirmed and retried", async () => {
  const t = transport();
  t.clear = mock().mockRejectedValueOnce(Error("private detail")).mockResolvedValue(2);
  render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
  await screen.findByText("Lives in Lyon");
  fireEvent.click(screen.getByRole("button", { name: labels.clear }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.clearConfirm })));
  expect(await screen.findByText(labels.failed)).toBeTruthy();
  expect((screen.getByRole("button", { name: labels.clear }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: labels.clear }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.clearConfirm })));
  expect(screen.getByText(labels.empty)).toBeTruthy();
  expect(screen.queryByText(labels.failed)).toBeNull();
});

test.each(["remove", "clear"])("an old refresh cannot restore memory after %s", async (action) => {
  const pending = Promise.withResolvers<{ memories: typeof facts; total: number } | null>();
  const started = Promise.withResolvers<void>();
  const t = transport();
  t.list = mock()
    .mockResolvedValueOnce({ memories: facts, total: 2 })
    .mockImplementationOnce(() => {
      started.resolve();
      return pending.promise;
    });
  const view = render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
  await screen.findByText("Lives in Lyon");
  view.rerender(
    <MemoryPanel transport={t} labels={labels} memory={{ available: true }} refreshKey={1} />,
  );
  await act(async () => {
    await started.promise;
  });
  if (action === "remove")
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /Forget: Lives in Lyon/ })),
    );
  else {
    fireEvent.click(screen.getByRole("button", { name: labels.clear }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: labels.clearConfirm })),
    );
  }
  await act(async () => pending.resolve({ memories: facts, total: 2 }));
  expect(screen.queryByText("Lives in Lyon")).toBeNull();
  if (action === "clear") expect(screen.queryByText("Prefers Vegeta")).toBeNull();
});

test("a removal from the old transport cannot edit the replacement memory", async () => {
  const pending = Promise.withResolvers<boolean>();
  const t = transport();
  t.remove = mock(() => pending.promise);
  const view = render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
  await screen.findByText("Lives in Lyon");
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: /Forget: Lives in Lyon/ })),
  );
  view.rerender(
    <MemoryPanel transport={transport()} labels={labels} memory={{ available: true }} />,
  );
  await screen.findByText("Lives in Lyon");
  await act(async () => pending.resolve(true));
  expect(screen.getByText("Lives in Lyon")).toBeTruthy();
  expect(screen.getByText("2 memories")).toBeTruthy();
});

test("a rejected read is visible and the next search can recover", async () => {
  const t = transport();
  t.list = mock()
    .mockRejectedValueOnce(Error("private detail"))
    .mockResolvedValue({ memories: [facts[1]!], total: 1 });
  render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
  expect(await screen.findByText(labels.failed)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(labels.searchLabel), { target: { value: "Lyon" } });
  expect(await screen.findByText("Lives in Lyon")).toBeTruthy();
  expect(screen.queryByText(labels.failed)).toBeNull();
});

test("finishing a removal after a new search preserves its unrelated result count", async () => {
  const pending = Promise.withResolvers<boolean>();
  const t = transport();
  t.remove = mock(() => pending.promise);
  render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
  await screen.findByText("Prefers Vegeta");
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: /Forget: Prefers Vegeta/ })),
  );
  fireEvent.change(screen.getByLabelText(labels.searchLabel), { target: { value: "Lyon" } });
  await screen.findByText("1 memories");
  await act(async () => pending.resolve(true));
  expect(screen.getByText("Lives in Lyon")).toBeTruthy();
  expect(screen.getByText("1 memories")).toBeTruthy();
});

test("a successful concurrent refresh does not erase a removal failure", async () => {
  const pending = Promise.withResolvers<{ memories: typeof facts; total: number } | null>();
  const started = Promise.withResolvers<void>();
  const t = transport();
  t.list = mock()
    .mockResolvedValueOnce({ memories: facts, total: 2 })
    .mockImplementationOnce(() => {
      started.resolve();
      return pending.promise;
    });
  t.remove = mock(async () => false);
  const view = render(<MemoryPanel transport={t} labels={labels} memory={{ available: true }} />);
  await screen.findByText("Lives in Lyon");
  view.rerender(
    <MemoryPanel transport={t} labels={labels} memory={{ available: true }} refreshKey={1} />,
  );
  await act(async () => {
    await started.promise;
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: /Forget: Lives in Lyon/ })),
  );
  expect(screen.getByText(labels.failed)).toBeTruthy();
  await act(async () => pending.resolve({ memories: facts, total: 2 }));
  expect(screen.getByText(labels.failed)).toBeTruthy();
  expect(screen.getByText("Lives in Lyon")).toBeTruthy();
});
