// SPDX-License-Identifier: Apache-2.0
// ModelsPanel: states and progress, one-click install, adapter import by dialog or path field.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  type ChatModelView,
  type ModelsLabels,
  ModelsPanel,
  type ModelsTransport,
} from "../../src/chat";

const labels: ModelsLabels = {
  title: "Models",
  description: "Chat models",
  checking: "Checking",
  unavailable: "No models here",
  failed: "Models failed",
  retry: "Retry models",
  empty: "No model",
  defaultBadge: "Default",
  local: "Local",
  remote: "Online",
  states: {
    ready: "Ready",
    loading: "Loading",
    downloading: "Downloading",
    installable: "Not installed",
    failed: "Failed",
    unavailable: "Unavailable",
  },
  install: "Install",
  importAdapter: "Import the adapter",
  chooseFile: "Choose the file",
  pathLabel: "Adapter path",
  pathPlaceholder: "/path",
  importSubmit: "Import",
  importFailed: "Import failed",
  progress: (received, total) => `${received}/${total ?? "?"}`,
};

const base: ChatModelView[] = [
  {
    id: "shenron-chat-v2",
    label: "Shenron chat v2",
    backend: "local",
    available: true,
    default: true,
    remote: false,
    state: "ready",
    importUrl: "/api/local/models/shenron-chat-v2/import",
  },
  {
    id: "gemma4-e2b",
    label: "Gemma 4 E2B",
    backend: "local",
    available: false,
    default: false,
    remote: false,
    state: "installable",
    installUrl: "/api/local/models/gemma4-e2b/install",
  },
  {
    id: "gemini-web/flash",
    label: "Gemini Flash",
    backend: "gemini-web",
    available: false,
    default: false,
    remote: true,
    state: "unavailable",
    detail: "not signed in",
  },
];

function transport(models: ChatModelView[][] = [base]): ModelsTransport {
  let call = 0;
  return {
    list: mock(async () => models[Math.min(call++, models.length - 1)]!),
    install: mock(async () => true),
    importAdapter: mock(async (_m: ChatModelView, path: string) =>
      path.endsWith(".gguf") ? null : "not a gguf",
    ),
  };
}

afterEach(cleanup);

describe("ModelsPanel", () => {
  test("changing the notification callback does not restart the model request", async () => {
    const pending = Promise.withResolvers<ChatModelView[] | null>();
    const t = transport();
    t.list = mock(() => pending.promise);
    const old = mock();
    const latest = mock();
    const view = render(
      <ModelsPanel transport={t} labels={labels} models={{ available: true }} onChange={old} />,
    );
    expect(screen.getByText("Checking")).toBeTruthy();
    view.rerender(
      <ModelsPanel transport={t} labels={labels} models={{ available: true }} onChange={latest} />,
    );
    await act(async () => {
      pending.resolve(base);
    });
    expect(t.list).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(base);
  });

  test("waits for a slow progress request before polling again", async () => {
    const pending = Promise.withResolvers<ChatModelView[] | null>();
    const downloading = [{ ...base[0]!, state: "downloading" as const }];
    const t = transport();
    t.list = mock()
      .mockResolvedValueOnce(downloading)
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(base);
    render(<ModelsPanel transport={t} labels={labels} models={{ available: true }} pollMs={20} />);
    await screen.findByText("Downloading");
    await act(async () => {
      await Bun.sleep(100);
    });
    expect(t.list).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.resolve(base);
    });
    expect(await screen.findByText("Ready")).toBeTruthy();
    await act(async () => {
      await Bun.sleep(60);
    });
    expect(t.list).toHaveBeenCalledTimes(2);
  });

  test("stops polling when the models group becomes unavailable", async () => {
    const t = transport([[{ ...base[0]!, state: "downloading" }]]);
    const view = render(
      <ModelsPanel transport={t} labels={labels} models={{ available: true }} pollMs={20} />,
    );
    await screen.findByText("Downloading");
    view.rerender(
      <ModelsPanel transport={t} labels={labels} models={{ available: false }} pollMs={20} />,
    );
    const calls = (t.list as ReturnType<typeof mock>).mock.calls.length;
    await act(async () => {
      await Bun.sleep(80);
    });
    expect(t.list).toHaveBeenCalledTimes(calls);
    expect(screen.getByText("No models here")).toBeTruthy();
    expect(screen.queryByText("Downloading")).toBeNull();
  });

  test("an install refresh waits for an older progress request and then reads again", async () => {
    const pending = Promise.withResolvers<ChatModelView[] | null>();
    const downloading = [{ ...base[0]!, state: "downloading" as const }, base[1]!];
    const t = transport();
    t.list = mock()
      .mockResolvedValueOnce(downloading)
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(base);
    render(<ModelsPanel transport={t} labels={labels} models={{ available: true }} pollMs={20} />);
    await screen.findByText("Downloading");
    await act(async () => {
      await Bun.sleep(50);
    });
    expect(t.list).toHaveBeenCalledTimes(2);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });
    expect(t.install).toHaveBeenCalledTimes(1);
    expect(t.list).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.resolve(downloading);
    });
    expect(await screen.findByText("Ready")).toBeTruthy();
    expect(t.list).toHaveBeenCalledTimes(3);
  });

  test("a closed panel never publishes a late result", async () => {
    const pending = Promise.withResolvers<ChatModelView[] | null>();
    const t = transport();
    t.list = mock(() => pending.promise);
    const changed = mock();
    const view = render(
      <ModelsPanel transport={t} labels={labels} models={{ available: true }} onChange={changed} />,
    );
    view.unmount();
    await act(async () => {
      pending.resolve(base);
    });
    expect(changed).not.toHaveBeenCalled();
  });

  test("a replaced transport cannot publish its old result", async () => {
    const pending = Promise.withResolvers<ChatModelView[] | null>();
    const old = transport();
    old.list = mock(() => pending.promise);
    const changed = mock();
    const view = render(
      <ModelsPanel
        transport={old}
        labels={labels}
        models={{ available: true }}
        onChange={changed}
      />,
    );
    view.rerender(
      <ModelsPanel
        transport={transport([[]])}
        labels={labels}
        models={{ available: true }}
        onChange={changed}
      />,
    );
    await screen.findByText("No model");
    await act(async () => {
      pending.resolve(base);
    });
    expect(screen.getByText("No model")).toBeTruthy();
    expect(screen.queryByText("Shenron chat v2")).toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  test("shows every state and installs on one click, then follows the download", async () => {
    const downloading = base.map((m) =>
      m.id === "gemma4-e2b"
        ? {
            ...m,
            state: "downloading" as const,
            progress: { received: 50, total: 200 },
            installUrl: undefined,
          }
        : m,
    );
    const t = transport([base, downloading]);
    const changes: ChatModelView[][] = [];
    render(
      <ModelsPanel
        transport={t}
        labels={labels}
        models={{ available: true }}
        pollMs={20}
        onChange={(m) => changes.push(m)}
      />,
    );
    expect(await screen.findByText("Not installed")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("not signed in")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Install" })));
    expect(t.install).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("50/200")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  test("imports the adapter through the path field and reports a refusal", async () => {
    const t = transport();
    render(<ModelsPanel transport={t} labels={labels} models={{ available: true }} />);
    const field = await screen.findByLabelText("Adapter path");
    fireEvent.change(field, { target: { value: "/tmp/adapter.bin" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import" })));
    expect(await screen.findByText("Import failed (not a gguf)")).toBeTruthy();
    fireEvent.change(field, { target: { value: "/tmp/shenron-chat-v2.gguf" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import" })));
    expect(t.importAdapter).toHaveBeenLastCalledWith(base[0], "/tmp/shenron-chat-v2.gguf");
    expect(screen.queryByText(/Import failed/)).toBeNull();
  });

  test("uses the native dialog when the host has one, the path field when it has none", async () => {
    const t = transport();
    const pick = mock(async () => "/home/me/shenron-chat-v2.gguf");
    render(
      <ModelsPanel
        transport={t}
        labels={labels}
        models={{ available: true }}
        pickAdapterPath={pick}
      />,
    );
    const choose = await screen.findByRole("button", { name: "Choose the file" });
    await act(async () => fireEvent.click(choose));
    expect(t.importAdapter).toHaveBeenCalledWith(base[0], "/home/me/shenron-chat-v2.gguf");
    cleanup();
    render(
      <ModelsPanel
        transport={transport()}
        labels={labels}
        models={{ available: true }}
        pickAdapterPath={async () => undefined}
      />,
    );
    const fallback = await screen.findByRole("button", { name: "Choose the file" });
    await act(async () => fireEvent.click(fallback));
    expect(screen.getByLabelText("Adapter path")).toBeTruthy();
  });

  test("an unavailable models group says why", () => {
    const t = transport();
    render(
      <ModelsPanel
        transport={t}
        labels={labels}
        models={{ available: false, reason: "aucun modèle" }}
      />,
    );
    expect(screen.getByText("aucun modèle")).toBeTruthy();
    expect(t.list).not.toHaveBeenCalled();
  });
});

test("a rejected model read settles and can be retried", async () => {
  const t = transport();
  t.list = mock()
    .mockRejectedValueOnce(new Error("private transport detail"))
    .mockResolvedValue(base);
  render(<ModelsPanel transport={t} labels={labels} models={{ available: true }} />);
  expect(await screen.findByText(labels.failed)).toBeTruthy();
  expect(screen.queryByText(labels.checking)).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.retry })));
  expect(await screen.findByText("Ready")).toBeTruthy();
  expect(screen.queryByText(labels.failed)).toBeNull();
  expect(t.list).toHaveBeenCalledTimes(2);
});

test.each(["false", "rejection"])(
  "a %s installation failure survives the next successful read",
  async (failure) => {
    const t = transport();
    t.install = mock(async () => {
      if (failure === "rejection") throw Error("private install detail");
      return false;
    });
    render(<ModelsPanel transport={t} labels={labels} models={{ available: true }} />);
    const button = await screen.findByRole("button", { name: labels.install });
    await act(async () => fireEvent.click(button));
    expect(await screen.findByText(labels.failed)).toBeTruthy();
    expect(t.list).toHaveBeenCalledTimes(2);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("private install detail")).toBeNull();
  },
);

test("a rejected adapter import releases controls and preserves the path for retry", async () => {
  const t = transport();
  t.importAdapter = mock()
    .mockRejectedValueOnce(Error("private import detail"))
    .mockResolvedValue(null);
  render(<ModelsPanel transport={t} labels={labels} models={{ available: true }} />);
  const input = (await screen.findByLabelText(labels.pathLabel)) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "/fixture/adapter.gguf" } });
  const button = screen.getByRole("button", { name: labels.importSubmit });
  await act(async () => fireEvent.click(button));
  expect(await screen.findByText(labels.importFailed)).toBeTruthy();
  expect((button as HTMLButtonElement).disabled).toBe(false);
  expect(input.value).toBe("/fixture/adapter.gguf");
  await act(async () => fireEvent.click(button));
  expect(screen.queryByText(labels.importFailed)).toBeNull();
  expect(input.value).toBe("");
});

test("a rejected native file dialog shows a localized error and remains retryable", async () => {
  const pick = mock(async () => {
    throw Error("private picker detail");
  });
  render(
    <ModelsPanel
      transport={transport()}
      labels={labels}
      models={{ available: true }}
      pickAdapterPath={pick}
    />,
  );
  const button = await screen.findByRole("button", { name: labels.chooseFile });
  await act(async () => fireEvent.click(button));
  expect(await screen.findByText(labels.importFailed)).toBeTruthy();
  expect((button as HTMLButtonElement).disabled).toBe(false);
});

test("an old installation cannot mark a replacement transport as failed", async () => {
  const pending = Promise.withResolvers<boolean>();
  const old = transport();
  old.install = mock(() => pending.promise);
  const latest = transport();
  const view = render(<ModelsPanel transport={old} labels={labels} models={{ available: true }} />);
  await screen.findByRole("button", { name: labels.install });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.install })));
  view.rerender(<ModelsPanel transport={latest} labels={labels} models={{ available: true }} />);
  await waitFor(() => expect(latest.list).toHaveBeenCalledTimes(1));
  await act(async () => pending.resolve(false));
  expect(screen.queryByText(labels.failed)).toBeNull();
  expect(latest.install).not.toHaveBeenCalled();
  expect((screen.getByRole("button", { name: labels.install }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

test("a rejected progress poll does not stop polling", async () => {
  const t = transport();
  t.list = mock()
    .mockResolvedValueOnce([{ ...base[0]!, state: "downloading" }])
    .mockRejectedValueOnce(Error("private poll detail"))
    .mockResolvedValue(base);
  render(<ModelsPanel transport={t} labels={labels} models={{ available: true }} pollMs={20} />);
  expect(await screen.findByText("Downloading")).toBeTruthy();
  expect(await screen.findByText("Ready")).toBeTruthy();
  expect(t.list).toHaveBeenCalledTimes(3);
  expect(screen.queryByText(labels.failed)).toBeNull();
});
