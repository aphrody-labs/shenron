// SPDX-License-Identifier: Apache-2.0
// ModelsPanel: states and progress, one-click install, adapter import by dialog or path field.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
