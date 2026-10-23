"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Play, SearchX, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useMemo, useState } from "react";
import { useConfirm } from "@/components/admin/admin-ui";
import {
  EmptyState,
  ErrorState,
  errorMessage,
  Section,
  SkeletonRows,
} from "@/components/admin/bot/BotUi";
import { PlainField } from "@/components/editor/PlainField";
import { api } from "@/lib/admin-api";

interface ServiceAction {
  service: string;
  action: string;
  description: string;
}

export default function ServicesPage() {
  const t = useTranslations("adminBot.services");
  const [filter, setFilter] = useState("");

  const services = useQuery({
    queryKey: ["services"],
    queryFn: () => api.get<{ actions: ServiceAction[] }>("/services"),
  });

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const out = new Map<string, ServiceAction[]>();
    for (const a of services.data?.actions ?? []) {
      if (q && !`${a.service} ${a.action} ${a.description}`.toLowerCase().includes(q)) continue;
      const list = out.get(a.service) ?? [];
      list.push(a);
      out.set(a.service, list);
    }
    return [...out.entries()];
  }, [services.data, filter]);

  const total = services.data?.actions.length ?? 0;

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        {t("intro")} <span className="text-xs">{t("warning")}</span>
      </p>

      {total > 0 && (
        <div>
          <label className="sr-only" htmlFor="service-filter">
            {t("filter")}
          </label>
          <input
            id="service-filter"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filterPlaceholder")}
            className="input w-full max-w-sm"
          />
        </div>
      )}

      {services.isError ? (
        <ErrorState
          message={errorMessage(services.error)}
          onRetry={() => services.refetch()}
          retrying={services.isFetching}
        />
      ) : services.isLoading ? (
        <SkeletonRows count={3} className="h-24" />
      ) : total === 0 ? (
        <EmptyState title={t("empty")} icon={<Wrench />} />
      ) : grouped.length === 0 ? (
        <EmptyState title={t("noMatch", { query: filter })} icon={<SearchX />} />
      ) : (
        grouped.map(([svc, actions]) => <ServiceGroup key={svc} service={svc} actions={actions} />)
      )}
    </div>
  );
}

function ServiceGroup({ service, actions }: { service: string; actions: ServiceAction[] }) {
  const t = useTranslations("adminBot.services");
  const label = t.has(`labels.${service}`) ? t(`labels.${service}`) : service;
  return (
    <Section
      title={
        <>
          {label}{" "}
          <span className="font-mono text-xs font-normal text-muted-foreground">({service})</span>
        </>
      }
    >
      <ul className="space-y-2">
        {actions.map((a) => (
          <ActionRow key={`${a.service}-${a.action}`} action={a} />
        ))}
      </ul>
    </Section>
  );
}

function ActionRow({ action }: { action: ServiceAction }) {
  const t = useTranslations("adminBot.services");
  const { confirm, dialog } = useConfirm();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("{}");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (parsed: unknown) =>
      api.post(`/services/${action.service}/${action.action}`, parsed),
    onSuccess: (data) => setResult({ ok: true, text: JSON.stringify(data, null, 2) }),
    onError: (err) => setResult({ ok: false, text: errorMessage(err) ?? t("failed") }),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.trim() || "{}");
    } catch {
      setResult({ ok: false, text: t("invalidJson") });
      return;
    }
    const empty = body.trim() === "{}" || body.trim() === "";
    const ok = await confirm({
      title: t("confirmTitle", { action: action.action, service: action.service }),
      description: empty
        ? t("confirmNoParams")
        : t("confirmParams", { params: body.trim().slice(0, 120) }),
      confirmLabel: t("run"),
    });
    if (!ok) return;
    setResult(null);
    mutation.mutate(parsed);
  };

  return (
    <li className="rounded-lg border border-border bg-background/40">
      {dialog}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/30"
      >
        <ChevronDown
          aria-hidden
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <div className="min-w-0 flex-1">
          <code className="text-sm font-medium text-primary">{action.action}</code>
          <p className="mt-0.5 text-xs text-muted-foreground">{action.description}</p>
        </div>
      </button>

      {open && (
        <form id={panelId} onSubmit={submit} className="space-y-2 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">{t("paramsHint")}</p>
          <PlainField
            value={body}
            onChange={setBody}
            minRows={3}
            maxRows={16}
            monospace
            spellCheck={false}
            label={t("paramsLabel")}
            hideLabel
          />
          <button type="submit" disabled={mutation.isPending} className="btn btn-primary">
            <Play aria-hidden className="h-3.5 w-3.5" />
            {mutation.isPending ? t("running") : t("run")}
          </button>
          <div aria-live="polite">
            {result && (
              <details className="mt-2" open={!result.ok}>
                <summary className="cursor-pointer select-none text-xs text-muted-foreground">
                  {result.ok ? t("result") : t("error")}
                </summary>
                <pre
                  className={`mt-1 overflow-x-auto rounded-lg border p-2 font-mono text-xs ${
                    result.ok
                      ? "border-border bg-background text-foreground"
                      : "border-dbz-red/40 bg-dbz-red/10 text-red-200"
                  }`}
                >
                  {result.text}
                </pre>
              </details>
            )}
          </div>
        </form>
      )}
    </li>
  );
}
