"use client";

import { StatusBadge } from "@aphrody/shenron-ui/admin";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, SearchX, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { api } from "@/lib/admin-api";
import { EmptyState, ErrorState, errorMessage, Section, SkeletonRows } from "./BotUi";

export interface BotCommand {
  name: string;
  description: string;
  type: number;
  guildId: string | null;
  nsfw: boolean;
  options: Array<{
    name: string;
    description: string;
    type: number;
    required: boolean;
    choices?: Array<{ name: string; value: string | number }>;
  }>;
}

export function CommandsPanel({ botId }: { botId: string }) {
  const t = useTranslations("adminBot.commands");
  const [filter, setFilter] = useState("");

  const cmds = useQuery({
    queryKey: ["bot", botId, "commands"],
    queryFn: () => api.get<{ commands: BotCommand[]; count: number }>(`/bots/${botId}/commands`),
    staleTime: 30_000,
  });

  const commands = cmds.data?.commands;
  const all = commands ?? [];
  const shown = useMemo(() => {
    const all = commands ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [commands, filter]);

  return (
    <Section
      title={t("title", { count: cmds.data?.count ?? all.length })}
      description={t("description")}
      actions={
        all.length > 0 && (
          <>
            <label className="sr-only" htmlFor="bot-command-filter">
              {t("filter")}
            </label>
            <input
              id="bot-command-filter"
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("filterPlaceholder")}
              className="input w-56 max-w-full"
            />
          </>
        )
      }
    >
      {cmds.isError ? (
        <ErrorState
          message={errorMessage(cmds.error)}
          onRetry={() => cmds.refetch()}
          retrying={cmds.isFetching}
        />
      ) : cmds.isLoading ? (
        <SkeletonRows count={4} className="h-12" />
      ) : all.length === 0 ? (
        <EmptyState title={t("empty")} icon={<Terminal />} />
      ) : shown.length === 0 ? (
        <EmptyState title={t("noMatch", { query: filter })} icon={<SearchX />} />
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <CommandRow key={`${c.type}:${c.name}`} cmd={c} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function CommandRow({ cmd }: { cmd: BotCommand }) {
  const t = useTranslations("adminBot.commands");
  const [open, setOpen] = useState(false);
  const expandable = cmd.options.length > 0;
  const panelId = `cmd-${cmd.type}-${cmd.name}`;
  const prefix = cmd.type === 1 ? "/" : "";

  const head = (
    <>
      <ChevronDown
        aria-hidden
        className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"} ${expandable ? "" : "opacity-0"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-sm font-semibold text-primary">
            {prefix}
            {cmd.name}
          </code>
          <StatusBadge tone="neutral">
            {cmd.type >= 1 && cmd.type <= 3 ? t(`types.${cmd.type}` as "types.1") : cmd.type}
          </StatusBadge>
          {cmd.nsfw && <StatusBadge tone="warning">{t("nsfw")}</StatusBadge>}
          {expandable && (
            <StatusBadge tone="info">{t("optionCount", { count: cmd.options.length })}</StatusBadge>
          )}
        </div>
        {cmd.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{cmd.description}</p>
        )}
      </div>
    </>
  );

  return (
    <li className="rounded-lg border border-border bg-background/40">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/30"
        >
          {head}
        </button>
      ) : (
        <div className="flex items-start gap-3 p-3">{head}</div>
      )}

      {open && expandable && (
        <div id={panelId} className="overflow-x-auto border-t border-border p-3">
          <table className="w-full min-w-[32rem] text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-1 text-left font-medium">
                  {t("columns.name")}
                </th>
                <th scope="col" className="px-2 py-1 text-left font-medium">
                  {t("columns.type")}
                </th>
                <th scope="col" className="px-2 py-1 text-left font-medium">
                  {t("columns.required")}
                </th>
                <th scope="col" className="px-2 py-1 text-left font-medium">
                  {t("columns.description")}
                </th>
                <th scope="col" className="px-2 py-1 text-left font-medium">
                  {t("columns.choices")}
                </th>
              </tr>
            </thead>
            <tbody>
              {cmd.options.map((o) => (
                <tr key={o.name} className="border-t border-border">
                  <td className="px-2 py-1 font-mono">{o.name}</td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {o.type >= 1 && o.type <= 11
                      ? t(`optionTypes.${o.type}` as "optionTypes.1")
                      : o.type}
                  </td>
                  <td className="px-2 py-1">{o.required ? t("yes") : "—"}</td>
                  <td className="px-2 py-1 text-muted-foreground">{o.description}</td>
                  <td className="px-2 py-1 text-muted-foreground">
                    {o.choices?.length ? o.choices.map((c) => c.name).join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}
