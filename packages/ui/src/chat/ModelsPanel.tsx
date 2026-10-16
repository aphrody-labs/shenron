/* oxlint-disable react/set-state-in-effect, jsx-a11y/prefer-tag-over-role -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Material 3 panel of the chat models of this server: the state of each one (ready, loading,
 * downloading with its progress, installable, failed, unavailable), one-click install and the
 * import of the fine-tuned adapter (native file dialog when the host has one, a path field
 * otherwise). Transport, labels and the file picker are injected. Styles: `@aphrody/shenron-ui/chat.css`.
 */
import { Banner, Button } from "@aphrody/m3-primitives";
import { CircleAlert, Cpu, Globe } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ChatGroupStatus } from "./model";

export type ChatModelStateName =
  | "ready"
  | "loading"
  | "downloading"
  | "installable"
  | "failed"
  | "unavailable";

/** One chat model of `GET /api/v1/models` (structural mirror of the contract entry). */
export interface ChatModelView {
  id: string;
  label: string;
  backend: string;
  available: boolean;
  default: boolean;
  remote: boolean;
  state: ChatModelStateName;
  progress?: { received: number; total: number | null };
  installUrl?: string;
  importUrl?: string;
  detail?: string;
}

/** Every method resolves, never throws. */
export interface ModelsTransport {
  list(): Promise<ChatModelView[] | null>;
  /** Starts the download (`installUrl`). */
  install(model: ChatModelView): Promise<boolean>;
  /** Imports the adapter from a local file (`importUrl`); the error text, or `null` on success. */
  importAdapter(model: ChatModelView, path: string): Promise<string | null>;
}

export interface ModelsLabels {
  title: string;
  description: string;
  checking: string;
  unavailable: string;
  failed: string;
  retry: string;
  empty: string;
  defaultBadge: string;
  local: string;
  remote: string;
  states: Record<ChatModelStateName, string>;
  install: string;
  importAdapter: string;
  chooseFile: string;
  pathLabel: string;
  pathPlaceholder: string;
  importSubmit: string;
  importFailed: string;
  /** Download progress: `received` and `total` bytes (`total` may be unknown). */
  progress: (received: number, total: number | null) => string;
  /** Estimated time left of a download, in seconds (shown once a rate is measured). */
  eta?: (seconds: number) => string;
}

/** Download rate of one model, smoothed over the polls (bytes per second). */
interface RateSample {
  received: number;
  at: number;
  rate: number | null;
}

/** Seconds left from the smoothed rate, or `null` while unknown. */
export function etaSeconds(sample: RateSample | undefined, total: number | null): number | null {
  if (!sample?.rate || !total || sample.rate <= 0) return null;
  return Math.max(0, Math.round((total - sample.received) / sample.rate));
}

/** Folds a new progress reading into the sample (exponential moving average of the rate). */
export function nextRateSample(
  previous: RateSample | undefined,
  received: number,
  at: number,
): RateSample {
  if (!previous || received < previous.received || at <= previous.at) {
    return { received, at, rate: previous && received >= previous.received ? previous.rate : null };
  }
  const instant = ((received - previous.received) * 1000) / (at - previous.at);
  const rate = previous.rate === null ? instant : previous.rate * 0.7 + instant * 0.3;
  return { received, at, rate };
}

/** Result of the host file picker: a path, `null` when cancelled, `undefined` when it has none. */
export type PickAdapterPath = () => Promise<string | null | undefined>;

export interface ModelsPanelProps {
  transport: ModelsTransport;
  labels: ModelsLabels;
  /** `models` group of the local health; `null` while it is being checked. */
  models: ChatGroupStatus | null;
  /** Native file dialog of the desktop app; absent: a path field. */
  pickAdapterPath?: PickAdapterPath;
  /** Polling period while a model downloads or loads (ms, default 2000). */
  pollMs?: number;
  /** Called after the list changed (e.g. so the chat refreshes its selector). */
  onChange?: (models: ChatModelView[]) => void;
  className?: string;
}

const BUSY: ReadonlySet<ChatModelStateName> = new Set(["downloading", "loading"]);

export function ModelsPanel({
  transport,
  labels,
  models: group,
  pickAdapterPath,
  pollMs = 2000,
  onChange,
  className,
}: ModelsPanelProps) {
  const [models, setModels] = useState<ChatModelView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [pathField, setPathField] = useState(!pickAdapterPath);
  const [path, setPath] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rates = useRef(new Map<string, RateSample>());
  const operation = useRef<symbol | null>(null);
  const onChangeRef = useRef(onChange);
  const requests = useRef<{
    active: boolean;
    transport: ModelsTransport;
    pending: Promise<void> | null;
  } | null>(null);
  const [samples, setSamples] = useState<ReadonlyMap<string, RateSample>>(() => new Map());
  const on = group?.available === true;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const load = useCallback(async () => {
    const session = requests.current;
    if (!session?.active || session.transport !== transport) return;
    const read = async () => {
      if (!session.active) return;
      const list = await transport.list().catch(() => null);
      if (!session.active) return;
      if (!list) {
        setFailed(true);
        return;
      }
      setFailed(false);
      const now = Date.now();
      for (const m of list) {
        if (m.state === "downloading" && m.progress) {
          rates.current.set(
            m.id,
            nextRateSample(rates.current.get(m.id), m.progress.received, now),
          );
        } else rates.current.delete(m.id);
      }
      setSamples(new Map(rates.current));
      setModels(list);
      onChangeRef.current?.(list);
    };
    // Mutations need a fresh reading after any older progress request completes.
    const pending = session.pending ? session.pending.then(read, read) : read();
    session.pending = pending;
    try {
      await pending;
    } finally {
      if (session.pending === pending) session.pending = null;
    }
  }, [transport]);

  useEffect(() => {
    const session = { active: on, transport, pending: null as Promise<void> | null };
    requests.current = session;
    setModels(null);
    setFailed(false);
    rates.current.clear();
    setSamples(new Map());
    operation.current = null;
    setBusy(false);
    setActionFailed(false);
    setImportError(null);
    if (on) void load();
    else rates.current.clear();
    return () => {
      session.active = false;
      if (requests.current === session) requests.current = null;
    };
  }, [on, transport, load]);

  const polling = models?.some((m) => BUSY.has(m.state)) === true;
  useEffect(() => {
    if (!on || !polling) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await load();
      if (active) timer = setTimeout(() => void poll(), pollMs);
    };
    timer = setTimeout(() => void poll(), pollMs);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [on, polling, pollMs, load]);

  async function install(model: ChatModelView) {
    const action = beginAction();
    if (!action) return;
    try {
      const ok = await transport.install(model).catch(() => false);
      if (!isCurrentAction(action)) return;
      setActionFailed(!ok);
      await load();
    } finally {
      finishAction(action);
    }
  }

  function beginAction() {
    const session = requests.current;
    if (operation.current || !session?.active || session.transport !== transport) return null;
    const token = Symbol();
    operation.current = token;
    setBusy(true);
    setActionFailed(false);
    setImportError(null);
    return { token, session };
  }

  function isCurrentAction(action: NonNullable<ReturnType<typeof beginAction>>) {
    return (
      action.session.active &&
      requests.current === action.session &&
      operation.current === action.token
    );
  }

  function finishAction(action: NonNullable<ReturnType<typeof beginAction>>) {
    if (!isCurrentAction(action)) return;
    operation.current = null;
    setBusy(false);
  }

  async function importFrom(model: ChatModelView, from: string) {
    const action = beginAction();
    if (!action) return;
    try {
      const error = await transport.importAdapter(model, from).catch(() => labels.importFailed);
      if (!isCurrentAction(action)) return;
      if (error) setImportError(error);
      else setPath("");
      await load();
    } finally {
      finishAction(action);
    }
  }

  async function choose(model: ChatModelView) {
    if (!pickAdapterPath) return setPathField(true);
    const action = beginAction();
    if (!action) return;
    let picked: string | null | undefined;
    try {
      picked = await pickAdapterPath();
      if (!isCurrentAction(action)) return;
      if (picked === undefined) setPathField(true);
    } catch {
      if (isCurrentAction(action)) setImportError(labels.importFailed);
      return;
    } finally {
      finishAction(action);
    }
    if (picked && action.session.active && requests.current === action.session)
      await importFrom(model, picked);
  }

  function submitPath(event: FormEvent, model: ChatModelView) {
    event.preventDefault();
    const value = path.trim();
    if (value) void importFrom(model, value);
  }

  return (
    <section
      className={[
        "shenron-chat flex flex-col gap-3 rounded-extra-large bg-surface-container-low p-4 text-on-surface",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-shenron-chat=""
      aria-labelledby="shenron-models-title"
    >
      <header className="flex items-start gap-3">
        <Cpu aria-hidden size={24} className="mt-0.5 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="shenron-models-title" className="m-0 text-title-large">
            {labels.title}
          </h2>
          <p className="m-0 text-body-medium text-on-surface-variant">{labels.description}</p>
        </div>
      </header>

      {group === null || (on && models === null && !failed) ? (
        <output className="m-0 block text-body-medium text-on-surface-variant">
          {labels.checking}
        </output>
      ) : !on ? (
        <Banner variant="default" showDot={false} icon={CircleAlert}>
          <p className="m-0">{group.reason ?? labels.unavailable}</p>
        </Banner>
      ) : null}

      {on && (failed || actionFailed) ? (
        <Banner variant="error" showDot={false} icon={CircleAlert}>
          <p className="m-0">{labels.failed}</p>
          {failed ? (
            <Button variant="text" disabled={busy} onClick={() => void load()}>
              {labels.retry}
            </Button>
          ) : null}
        </Banner>
      ) : null}

      {on && models && models.length === 0 ? (
        <p className="m-0 text-body-medium text-on-surface-variant">{labels.empty}</p>
      ) : null}

      {on && models && models.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {models.map((m) => {
            const ratio =
              m.state === "downloading" && m.progress?.total
                ? Math.min(1, m.progress.received / m.progress.total)
                : null;
            return (
              <li
                key={m.id}
                className="flex flex-col gap-2 rounded-large bg-surface-container px-4 py-3"
                data-model={m.id}
                data-state={m.state}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {m.remote ? (
                    <Globe aria-hidden size={18} className="text-on-surface-variant" />
                  ) : (
                    <Cpu aria-hidden size={18} className="text-on-surface-variant" />
                  )}
                  <span className="text-title-medium">{m.label}</span>
                  <span className="text-label-small text-on-surface-variant">
                    {m.remote ? labels.remote : labels.local}
                  </span>
                  {m.default ? (
                    <span className="rounded-small bg-tertiary-container px-2 py-0.5 text-label-small text-on-tertiary-container">
                      {labels.defaultBadge}
                    </span>
                  ) : null}
                  <span
                    className={[
                      "ml-auto rounded-small px-2 py-0.5 text-label-medium",
                      m.state === "ready"
                        ? "bg-secondary-container text-on-secondary-container"
                        : m.state === "failed"
                          ? "bg-error-container text-on-error-container"
                          : "bg-surface-container-highest text-on-surface-variant",
                    ].join(" ")}
                  >
                    {labels.states[m.state]}
                  </span>
                </div>

                {m.state === "downloading" && m.progress ? (
                  <div className="flex flex-col gap-1">
                    <div
                      className="h-1 overflow-hidden rounded-full bg-surface-container-highest"
                      role="progressbar"
                      aria-label={`${labels.states.downloading} ${m.label}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      {...(ratio !== null ? { "aria-valuenow": Math.round(ratio * 100) } : {})}
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: ratio !== null ? `${ratio * 100}%` : "30%" }}
                      />
                    </div>
                    <p className="m-0 text-label-small text-on-surface-variant">
                      {labels.progress(m.progress.received, m.progress.total)}
                      {(() => {
                        const left = labels.eta
                          ? etaSeconds(samples.get(m.id), m.progress.total)
                          : null;
                        return left !== null && labels.eta ? ` · ${labels.eta(left)}` : null;
                      })()}
                    </p>
                  </div>
                ) : null}

                {m.detail && m.state !== "ready" ? (
                  <p className="m-0 text-body-small text-on-surface-variant">{m.detail}</p>
                ) : null}

                {m.installUrl ? (
                  <Button
                    variant="filled"
                    size="md"
                    className="self-start"
                    disabled={busy}
                    onClick={() => void install(m)}
                  >
                    {labels.install}
                  </Button>
                ) : null}

                {m.importUrl ? (
                  <div className="flex flex-col gap-2">
                    <p className="m-0 text-label-large">{labels.importAdapter}</p>
                    {pickAdapterPath && !pathField ? (
                      <Button
                        variant="tonal"
                        size="md"
                        className="self-start"
                        disabled={busy}
                        onClick={() => void choose(m)}
                      >
                        {labels.chooseFile}
                      </Button>
                    ) : (
                      <form
                        className="flex flex-col gap-2 sm:flex-row"
                        onSubmit={(event) => submitPath(event, m)}
                      >
                        <label className="sr-only" htmlFor={`shenron-adapter-${m.id}`}>
                          {labels.pathLabel}
                        </label>
                        <input
                          id={`shenron-adapter-${m.id}`}
                          className="h-10 flex-1 rounded-small border border-outline bg-transparent px-3 text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant focus-visible:border-2 focus-visible:border-primary"
                          value={path}
                          disabled={busy}
                          maxLength={1024}
                          placeholder={labels.pathPlaceholder}
                          onChange={(event) => setPath(event.target.value)}
                        />
                        <Button
                          type="submit"
                          variant="filled"
                          size="md"
                          disabled={busy || !path.trim()}
                        >
                          {labels.importSubmit}
                        </Button>
                      </form>
                    )}
                    {importError ? (
                      <p className="m-0 text-body-small text-error" role="alert">
                        {labels.importFailed}
                        {importError !== labels.importFailed ? ` (${importError})` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
