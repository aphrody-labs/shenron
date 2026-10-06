// SPDX-License-Identifier: Apache-2.0
// ChatPanel: persisted conversations, a streamed answer with its citations, the unavailable model.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel, type ChatLabels, type ChatTransport } from "../../src/chat";

const labels: ChatLabels = {
  title: "Chat",
  newConversation: "New chat",
  conversations: "Chats",
  noConversations: "No chat",
  historyUnavailable: "No history",
  untitled: "Untitled",
  welcomeTitle: "Ask Shenron",
  welcomeBody: "Welcome body",
  placeholder: "Your question",
  you: "You",
  assistant: "Shenron",
  thinking: "Thinking",
  sources: "Sources",
  openSource: "Open source",
  checking: "Checking",
  unavailableTitle: "Model unavailable",
  unavailableBody: "No model loaded",
  truncated: "Truncated",
  stopped: "Stopped",
  dismiss: "Dismiss",
  errors: {
    unavailable: "No chat here",
    http: "Refused",
    error: "Failed",
    aborted: "Aborted",
    unreachable: "Unreachable",
  },
  memoryUsed: ({ recalled, stored }) => `memory ${recalled}/${stored}`,
  modelProvider: (m) => (m.remote ? "Online" : "Local"),
};

const on = { available: true };

function transport(overrides: Partial<ChatTransport> = {}): ChatTransport {
  return {
    listConversations: mock(async () => [
      { id: "c_saved001", title: "Saved chat", updatedAt: "2026-10-05T10:00:00.000Z" },
    ]),
    loadConversation: mock(async () => [
      { id: "m_1", role: "user" as const, content: "Old question", citations: [] },
      { id: "m_2", role: "assistant" as const, content: "Old answer", citations: [] },
    ]),
    send: mock(async (_input, onEvent) => {
      onEvent({
        type: "meta",
        data: {
          streamId: "s_12345678",
          conversationId: "c_new00001",
          messageId: "m_3",
          replyId: "r_1",
        },
      });
      onEvent({ type: "tool", data: { name: "memory:recall", ok: true, hits: 2 } });
      onEvent({ type: "delta", data: { text: "Frieza rules [1]." } });
      onEvent({
        type: "done",
        data: {
          replyId: "r_1",
          conversationId: "c_new00001",
          backend: "local",
          model: "shenron-db",
          citations: [
            {
              n: 1,
              title: "Daizenshuu 2",
              url: "https://dragonballfr.com/d2",
              kind: "databook",
              source: "vfs",
            },
          ],
          finishReason: "stop",
          memory: { recalled: 2, stored: 1 },
        },
      });
      return { ok: true as const };
    }),
    ...overrides,
  };
}

afterEach(cleanup);

describe("ChatPanel", () => {
  test("lists the saved conversations and reopens one", async () => {
    const t = transport();
    render(<ChatPanel transport={t} labels={labels} chat={on} conversations={on} />);
    const item = await screen.findByRole("button", { name: /Saved chat/ });
    await act(async () => fireEvent.click(item));
    expect(t.loadConversation).toHaveBeenCalledWith("c_saved001");
    expect(await screen.findByText("Old answer")).toBeTruthy();
    expect(item.getAttribute("aria-current")).toBe("page");
  });

  test("sends a question, streams the answer and shows its citations", async () => {
    const t = transport();
    const opened: string[] = [];
    const turns: unknown[] = [];
    render(
      <ChatPanel
        transport={t}
        labels={labels}
        chat={on}
        conversations={on}
        onOpenLink={(url) => opened.push(url)}
        onTurnDone={(memory) => turns.push(memory)}
      />,
    );
    const input = screen.getByPlaceholderText("Your question");
    fireEvent.change(input, { target: { value: "Who is Frieza?" } });
    await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
    await waitFor(() => expect(screen.getByText("Frieza rules [1].")).toBeTruthy());
    expect(t.send).toHaveBeenCalledTimes(1);
    const [input0] = (t.send as ReturnType<typeof mock>).mock.calls[0] as [
      { message: string; conversationId?: string },
    ];
    expect(input0.message).toBe("Who is Frieza?");
    expect(input0.conversationId).toBeUndefined();
    const chip = screen.getByRole("link", { name: /Open source 1: Daizenshuu 2/ });
    fireEvent.click(chip);
    expect(opened).toEqual(["https://dragonballfr.com/d2"]);
    expect(screen.getByText("shenron-db")).toBeTruthy();
    expect(screen.getByText("memory 2/1")).toBeTruthy();
    expect(turns).toEqual([{ recalled: 2, stored: 1 }]);
  });

  test("sends the default model when the server offers several", async () => {
    const t = transport({
      listModels: mock(async () => ({
        models: [
          { id: "shenron-chat-v2", label: "Shenron chat v2", backend: "local", remote: false },
          { id: "gemini-web/flash", label: "Gemini Flash", backend: "gemini-web", remote: true },
        ],
        defaultModel: "shenron-chat-v2",
      })),
    });
    render(<ChatPanel transport={t} labels={labels} chat={on} conversations={on} />);
    expect(await screen.findByText("Shenron chat v2")).toBeTruthy();
    const input = screen.getByPlaceholderText("Your question");
    fireEvent.change(input, { target: { value: "Hi" } });
    await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
    const [sent] = (t.send as ReturnType<typeof mock>).mock.calls[0] as [{ model?: string }];
    expect(sent.model).toBe("shenron-chat-v2");
  });

  test("an unavailable model blocks the composer and says why", () => {
    const t = transport();
    render(
      <ChatPanel
        transport={t}
        labels={labels}
        chat={{ available: false, reason: "aucun modèle déclaré" }}
        conversations={{ available: false }}
      />,
    );
    expect(screen.getByText("Model unavailable")).toBeTruthy();
    expect(screen.getByText("aucun modèle déclaré")).toBeTruthy();
    expect(screen.getByText("No history")).toBeTruthy();
    expect(t.listConversations).not.toHaveBeenCalled();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(t.send).not.toHaveBeenCalled();
  });

  test("a failed send shows the localized error", async () => {
    const t = transport({
      send: mock(async () => ({ ok: false as const, kind: "unreachable" as const })),
    });
    render(<ChatPanel transport={t} labels={labels} chat={on} conversations={on} />);
    const input = screen.getByPlaceholderText("Your question");
    fireEvent.change(input, { target: { value: "Hello" } });
    await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
    expect(await screen.findByText("Unreachable")).toBeTruthy();
  });
});
