// SPDX-License-Identifier: Apache-2.0
// Studio du bureau dans Tauri simulé (mockIPC) : l'en-tête et les quatre onglets, chaque écran
// monté sur ses commandes réelles (`studio_*`, `shenron_chat`), et la question sourcée qui
// passe par Shenron en ligne.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC } from "@aphrody/api/mocks";
import { ShenronStudio } from "../../src/studio/ShenronStudio";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Call = { cmd: string; payload: unknown };
let calls: Call[] = [];
let root: Root | undefined;
let container: HTMLDivElement | undefined;

const COMMANDS: Record<string, (payload: unknown) => unknown> = {
  studio_shenron_health: () => ({
    status: "operational",
    site: { reachable: true },
    bot: { reachable: false },
    aphrody_ai_http: { configured: false },
    serving_rag: { reachable: true, ready: true },
    agent_home: { valid: true, files: 3 },
    rag_backend: "aphrody",
  }),
  studio_shenron_rag_stats: () => ({ chunks: 12, vectors: 10, sources: [] }),
  studio_shenron_training: () => ({
    python_project: null,
    gpu_count: 1,
    candidate_root: "/candidats",
    rag_promotion: "Promotion par le propriétaire RAG.",
  }),
  studio_native_ai_status: () => ({
    chat: { ready: true, model: "qwen-local" },
    embed: { ready: false },
    rerank: { ready: false },
  }),
  studio_corpus_info: () => ({ documents: 42 }),
  shenron_chat: () => ({
    answer: "Freezer annonce 530 000.",
    mode: "rag",
    hits: [
      {
        title: "Freezer",
        url: "https://dragonballfr.com/wiki/freezer",
        snippet: "Puissance de combat",
        score: 0.9,
        kind: "wiki",
        source_id: "wiki:freezer",
      },
    ],
  }),
};

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<ShenronStudio />));
  await settle();
}

function tab(name: string): HTMLElement {
  const found = [...container!.querySelectorAll<HTMLElement>("[role=tab]")].find(
    (element) => element.textContent === name,
  );
  if (!found) throw new Error(`onglet absent : ${name}`);
  return found;
}

beforeEach(() => {
  calls = [];
  mockIPC(
    (cmd, payload) => {
      calls.push({ cmd, payload });
      const handler = COMMANDS[cmd];
      if (!handler) throw new Error(`commande absente : ${cmd}`);
      return handler(payload);
    },
    { shouldMockEvents: true },
  );
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  clearMocks();
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe("studio du bureau", () => {
  test("la page porte son titre, l'état des services et quatre onglets", async () => {
    await mount();
    expect(container!.querySelector("h1")?.textContent).toBe("Studio");
    expect(container!.textContent).toContain("Opérationnel");
    expect(container!.textContent).toContain("12 passages");
    expect([...container!.querySelectorAll("[role=tab]")].map((t) => t.textContent)).toEqual([
      "Pilotage",
      "Databooks",
      "Entraînement",
      "Administration",
      "Pipeline natif",
    ]);
  });

  test("chaque onglet monte son écran sur ses commandes", async () => {
    await mount();
    for (const [name, text, command] of [
      ["Databooks", "42 documents en local", "studio_corpus_info"],
      ["Entraînement", "GPU détectés : 1", "studio_shenron_training"],
      ["Administration", "Chat : qwen-local", "studio_native_ai_status"],
    ] as const) {
      await act(async () => tab(name).click());
      await settle();
      expect(container!.textContent).toContain(text);
      expect(calls.some((call) => call.cmd === command)).toBe(true);
    }
  });

  test("la question sourcée peut interroger Shenron en ligne (shenron_chat)", async () => {
    await mount();
    await act(async () => tab("Databooks").click());
    await settle();
    const source = container!.querySelector<HTMLSelectElement>(
      'select[aria-label="Source de la réponse"]',
    )!;
    const question = container!.querySelector<HTMLInputElement>('input[aria-label="Question"]')!;
    await act(async () => {
      source.value = "site";
      source.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(question, "Puissance de Freezer ?");
      question.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => question.form!.requestSubmit());
    await settle();
    expect(calls.find((call) => call.cmd === "shenron_chat")?.payload).toEqual({
      query: "Puissance de Freezer ?",
    });
    expect(container!.textContent).toContain("Freezer annonce 530 000.");
    expect(container!.textContent).toContain("dragonballfr.com · rag");
    expect(container!.textContent).toContain("https://dragonballfr.com/wiki/freezer");
  });
});
