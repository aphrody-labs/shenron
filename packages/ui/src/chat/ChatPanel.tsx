/* oxlint-disable react/exhaustive-effect-dependencies, jsx-a11y/prefer-tag-over-role -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Material 3 chat surface of Shenron Studio (list-detail canonical layout): the Shenron
 * assembly around `@aphrody/m3-ai` (`MessageBubble`, `ChatComposer`) — persisted
 * conversations in a side pane, the streamed thread with its numbered citations, the
 * availability of the model. Transport, labels and availability are injected: the component
 * never fetches by itself and carries no text. Styles: `@aphrody/shenron-ui/chat.css`.
 */
import { ChatComposer, MessageBubble } from "@aphrody/m3-ai";
import { Banner, Button } from "@aphrody/m3-primitives";
import { Brain, CircleAlert, ExternalLink, MessageSquare, Plus, X } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { safeMarkdownHref } from "../markdown";
import {
  type ChatCitation,
  type ChatFailureKind,
  type ChatGroupStatus,
  type ChatModelChoice,
  type ChatMessageView,
  type ChatTransport,
  type ChatTurnMemory,
  chatReducer,
  historyOf,
  initialChatState,
} from "./model";

/** Every visible string of the surface, in the reader's language (injected by the host). */
export interface ChatLabels {
  title: string;
  newConversation: string;
  conversations: string;
  noConversations: string;
  historyUnavailable: string;
  untitled: string;
  welcomeTitle: string;
  welcomeBody: string;
  placeholder: string;
  you: string;
  assistant: string;
  thinking: string;
  sources: string;
  openSource: string;
  checking: string;
  unavailableTitle: string;
  unavailableBody: string;
  truncated: string;
  stopped: string;
  dismiss: string;
  errors: Record<ChatFailureKind, string>;
  /** Discreet note of the persistent memory of a turn (counts > 0 only). */
  memoryUsed: (memory: ChatTurnMemory) => string;
  /** Provider group of a model in the selector (`local` → on this computer, remote otherwise). */
  modelProvider: (model: ChatModelChoice) => string;
}

export interface ChatPanelProps {
  transport: ChatTransport;
  labels: ChatLabels;
  /** `chat` group of the local health; `null` while it is being checked. */
  chat: ChatGroupStatus | null;
  /** `conversations` group of the local health; `null` while it is being checked. */
  conversations: ChatGroupStatus | null;
  /** Opens a citation or a link of an answer (system browser in the desktop app). */
  onOpenLink?: (url: string) => void;
  /** Formats `updatedAt` of a conversation (locale of the host). */
  formatDate?: (iso: string) => string;
  /** After each settled turn, with its memory report (e.g. to refresh a memory panel). */
  onTurnDone?: (memory: ChatTurnMemory | undefined) => void;
  /** Changing it reloads the model selector (a model was installed or imported). */
  modelsKey?: number;
  className?: string;
}

let counter = 0;
function clientId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "").slice(0, 20)
      : `${Date.now().toString(36)}${(counter++).toString(36)}`;
  return `${prefix}_${random}`;
}

/**
 * Routes a click on any link of the surface (answers rendered by `m3-ai` `Markdown`, citation
 * chips) to `onOpenLink`: in the desktop webview a plain navigation would leave the app.
 */
function interceptLinks(onOpenLink?: (url: string) => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if (!onOpenLink) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!anchor) return;
    event.preventDefault();
    const safe = safeMarkdownHref(anchor.getAttribute("href"));
    if (safe) onOpenLink(safe);
  };
}

function Citations({ citations, labels }: { citations: ChatCitation[]; labels: ChatLabels }) {
  if (citations.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 px-1" aria-label={labels.sources}>
      <h3 className="m-0 text-label-medium text-on-surface-variant">{labels.sources}</h3>
      <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
        {citations.map((c) => {
          const body = (
            <>
              <span className="inline-grid size-5 place-items-center rounded-full bg-tertiary-container text-label-small text-on-tertiary-container">
                {c.n}
              </span>
              <span className="truncate">{c.title}</span>
            </>
          );
          const chip =
            "inline-flex h-8 max-w-72 items-center gap-2 rounded-small border border-outline-variant pr-3 pl-2 text-label-large text-on-surface no-underline";
          return (
            <li key={`${c.n}-${c.title}`}>
              {c.url ? (
                <a
                  className={`${chip} transition-colors duration-200 hover:bg-on-surface/8`}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c.snippet ?? c.title}
                  aria-label={`${labels.openSource} ${c.n}: ${c.title}`}
                >
                  {body}
                  <ExternalLink aria-hidden size={14} />
                </a>
              ) : (
                <span className={chip} title={c.snippet ?? c.title}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Message({ message, labels }: { message: ChatMessageView; labels: ChatLabels }) {
  const mine = message.role === "user";
  return (
    <li className="flex flex-col gap-1.5" data-role={message.role}>
      <span className="sr-only">{mine ? labels.you : labels.assistant}</span>
      {!mine && message.pending && message.content.length === 0 ? (
        <p className="shenron-chat__thinking m-0 py-1.5 text-body-large text-on-surface-variant">
          {labels.thinking}
        </p>
      ) : (
        <MessageBubble
          content={message.content}
          isUser={mine}
          isStreaming={message.pending === true}
        />
      )}
      {!mine ? (
        <>
          <Citations citations={message.citations} labels={labels} />
          {message.finishReason === "length" ? (
            <p className="m-0 px-1 text-body-small text-on-surface-variant">{labels.truncated}</p>
          ) : message.finishReason === "aborted" ? (
            <p className="m-0 px-1 text-body-small text-on-surface-variant">{labels.stopped}</p>
          ) : null}
          {message.memory && (message.memory.recalled > 0 || message.memory.stored > 0) ? (
            <p
              className="m-0 inline-flex items-center gap-1.5 px-1 text-label-small text-on-surface-variant"
              data-memory=""
            >
              <Brain aria-hidden size={14} />
              {labels.memoryUsed(message.memory)}
            </p>
          ) : null}
          {message.model && !message.pending ? (
            <p className="m-0 px-1 text-label-small text-on-surface-variant">{message.model}</p>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export function ChatPanel({
  transport,
  labels,
  chat,
  conversations: history,
  onOpenLink,
  formatDate,
  onTurnDone,
  modelsKey = 0,
  className,
}: ChatPanelProps) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<ChatModelChoice[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const streamId = useRef<string | null>(null);
  const thread = useRef<HTMLOListElement | null>(null);
  const openGeneration = useRef(0);

  const historyOn = history?.available === true;
  const chatOn = chat?.available === true;
  const unavailable = chat !== null && !chat.available;
  const streaming = state.status === "streaming";
  const historyBlocked = state.status === "loading" || state.status === "load-error";

  useEffect(
    () => () => {
      openGeneration.current++;
    },
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new transport invalidates reads from the previous connection.
    [transport],
  );

  const refresh = useCallback(async () => {
    const list = await transport.listConversations();
    if (list) dispatch({ type: "conversations", conversations: list });
  }, [transport]);

  useEffect(() => {
    if (historyOn) void refresh();
  }, [historyOn, refresh]);

  useEffect(() => {
    if (!chatOn || !transport.listModels) return;
    let live = true;
    void transport.listModels().then((result) => {
      if (!live || !result) return;
      setModels(result.models);
      setModel((current) =>
        current && result.models.some((m) => m.id === current)
          ? current
          : (result.defaultModel ?? result.models[0]?.id ?? null),
      );
      return undefined;
    });
    return () => {
      live = false;
    };
  }, [chatOn, transport, modelsKey]);

  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    const node = thread.current;
    if (node && typeof node.scrollTo === "function") node.scrollTo({ top: node.scrollHeight });
  }, [state.messages]);

  async function open(id: string) {
    if (streaming || (id === state.activeId && state.status !== "load-error")) return;
    const generation = ++openGeneration.current;
    dispatch({ type: "open", id });
    try {
      const messages = await transport.loadConversation(id);
      if (generation !== openGeneration.current) return;
      if (messages === null) dispatch({ type: "openFailed", id });
      else dispatch({ type: "opened", id, messages });
    } catch {
      if (generation === openGeneration.current) dispatch({ type: "openFailed", id });
    }
  }

  async function submit() {
    const message = draft.trim();
    if (!message || streaming || historyBlocked || !chatOn) return;
    const turns = historyOf(state.messages);
    const conversationId = state.activeId ?? undefined;
    setDraft("");
    dispatch({ type: "send", userId: clientId("u"), replyId: clientId("a"), message });
    const controller = new AbortController();
    abort.current = controller;
    streamId.current = null;
    let turnMemory: ChatTurnMemory | undefined;
    const outcome = await transport.send(
      {
        message,
        ...(conversationId ? { conversationId } : {}),
        ...(model && models.length > 1 ? { model } : {}),
        history: turns,
      },
      (chatEvent) => {
        if (chatEvent.type === "meta") streamId.current = chatEvent.data.streamId;
        if (chatEvent.type === "done") turnMemory = chatEvent.data.memory;
        dispatch({ type: "event", event: chatEvent });
      },
      controller.signal,
    );
    abort.current = null;
    dispatch({ type: "finish", outcome });
    if (outcome.ok) onTurnDone?.(turnMemory);
    if (historyOn) void refresh();
  }

  function stop() {
    const id = streamId.current;
    abort.current?.abort();
    if (id) void transport.cancel?.(id);
  }

  return (
    <div
      className={[
        "shenron-chat grid gap-3 rounded-extra-large bg-surface p-3 text-on-surface min-[840px]:grid-cols-[280px_minmax(0,1fr)] min-[840px]:gap-6",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-shenron-chat="conversation"
      onClickCapture={interceptLinks(onOpenLink)}
    >
      <nav
        className="flex min-w-0 flex-col gap-2 rounded-large bg-surface-container-low p-3"
        aria-label={labels.conversations}
      >
        <Button
          variant="filled"
          size="lg"
          rounding="square"
          className="self-start"
          onClick={() => {
            openGeneration.current++;
            dispatch({ type: "new" });
          }}
          disabled={streaming}
        >
          <Plus aria-hidden size={20} />
          {labels.newConversation}
        </Button>
        <h2 className="m-0 mt-2 px-1 text-label-medium text-on-surface-variant">
          {labels.conversations}
        </h2>
        {history === null ? null : !historyOn ? (
          <p className="m-0 px-1 text-body-medium text-on-surface-variant">
            {history.reason ?? labels.historyUnavailable}
          </p>
        ) : state.conversations.length === 0 ? (
          <p className="m-0 px-1 text-body-medium text-on-surface-variant">
            {labels.noConversations}
          </p>
        ) : (
          <ul className="m-0 flex max-h-[60dvh] list-none flex-col gap-0.5 overflow-y-auto p-0">
            {state.conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-full border-0 bg-transparent px-4 py-2 text-left text-on-surface-variant transition-colors duration-200 hover:bg-on-surface/8 disabled:cursor-default aria-[current=page]:bg-secondary-container aria-[current=page]:text-on-secondary-container"
                  aria-current={c.id === state.activeId ? "page" : undefined}
                  aria-busy={(c.id === state.activeId && state.status === "loading") || undefined}
                  onClick={() => void open(c.id)}
                  disabled={streaming}
                >
                  <MessageSquare aria-hidden size={18} className="shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-label-large">{c.title ?? labels.untitled}</span>
                    {formatDate ? (
                      <span className="text-label-small opacity-80">{formatDate(c.updatedAt)}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <section className="flex min-h-0 min-w-0 flex-col gap-3" aria-label={labels.title}>
        {chat === null ? (
          <output className="m-0 block px-1 text-body-medium text-on-surface-variant">
            {labels.checking}
          </output>
        ) : unavailable ? (
          <Banner variant="default" showDot={false} icon={CircleAlert} role="status">
            <p className="m-0 text-title-small">{labels.unavailableTitle}</p>
            <p className="m-0">{chat.reason ?? labels.unavailableBody}</p>
          </Banner>
        ) : null}

        {state.messages.length === 0 && !historyBlocked ? (
          <div className="flex flex-1 flex-col justify-center gap-2 p-6 text-on-surface-variant">
            <h2 className="m-0 text-headline-small text-on-surface">{labels.welcomeTitle}</h2>
            <p className="m-0 max-w-[60ch] text-body-large">{labels.welcomeBody}</p>
          </div>
        ) : (
          <ol
            className="m-0 flex max-h-[64dvh] flex-1 list-none flex-col gap-4 overflow-y-auto px-1 py-2"
            ref={thread}
            aria-live="polite"
            aria-busy={streaming || state.status === "loading" || undefined}
          >
            {state.messages.map((m) => (
              <Message key={m.id} message={m} labels={labels} />
            ))}
          </ol>
        )}

        {state.error ? (
          <Banner variant="error" showDot={false} icon={CircleAlert}>
            <div className="flex items-start gap-3">
              <p className="m-0 flex-1">
                {labels.errors[state.error.kind]}
                {state.error.detail ? ` (${state.error.detail})` : ""}
              </p>
              <button
                type="button"
                className="-m-2 inline-grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-inherit hover:bg-on-error-container/8"
                aria-label={labels.dismiss}
                onClick={() => dispatch({ type: "dismiss" })}
              >
                <X aria-hidden size={18} />
              </button>
            </div>
          </Banner>
        ) : null}

        <ChatComposer
          draft={draft}
          onDraftChange={setDraft}
          onSend={() => void submit()}
          placeholder={chatOn ? labels.placeholder : labels.unavailableTitle}
          isSending={streaming}
          disabled={historyBlocked || !chatOn}
          {...(models.length > 1 && model
            ? {
                modelSelector: {
                  value: model,
                  options: models.map((m) => ({
                    id: m.id,
                    name: m.label,
                    provider: labels.modelProvider(m),
                  })),
                  onChange: setModel,
                },
              }
            : {})}
          {...(streaming ? { onStop: stop } : {})}
        />
      </section>
    </div>
  );
}
