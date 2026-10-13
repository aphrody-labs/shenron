"use client";

import { useQuery } from "@tanstack/react-query";
import { Terminal, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/admin-api";
import { parseLogsResponse } from "./logs-view";

export default function Logs() {
  const t = useTranslations("adminLogs");
  const [lines, setLines] = useState(100);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["logs", lines],
    queryFn: async ({ signal }) =>
      parseLogsResponse(await api.get(`/health/logs?lines=${lines}`, { signal })),
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-brand-400" />
          <h2 className="text-lg font-semibold">{t("title")}</h2>
        </div>
        <p className="mt-1 text-sm text-zinc-400">{t("description", { seconds: 10 })}</p>
      </div>

      <div className="card flex items-center gap-3">
        <label htmlFor="admin-log-lines" className="text-sm text-zinc-400">
          {t("lines")}
        </label>
        <select
          id="admin-log-lines"
          className="input w-32"
          value={lines}
          onChange={(e) => setLines(Number(e.target.value))}
        >
          {[50, 100, 200, 500].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn btn-ghost ml-auto"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          {t("refresh")}
        </button>
      </div>

      {isError && (
        <div role="alert" className="card border-red-400/30 text-red-300">
          {t("error")}
        </div>
      )}
      {isLoading ? (
        <div className="text-zinc-500">{t("loading")}</div>
      ) : (
        <div className="card overflow-x-auto bg-zinc-950 p-3 font-mono text-xs">
          {data?.logs.map((log) => (
            <div key={log.key} className="whitespace-pre-wrap py-0.5">
              {log.raw ? (
                <span className="text-zinc-300">{log.raw}</span>
              ) : (
                <>
                  <span className="text-zinc-500">{log.time}</span>
                  {" — "}
                  <span className={colorize(log.message ?? "")}>{log.message}</span>
                </>
              )}
            </div>
          ))}
          {!isError && data?.logs.length === 0 && (
            <p className="italic text-zinc-500">{t("empty")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function colorize(message: string): string {
  if (/\bERROR\b|\berror\b|\bFAIL\b|\bfail\b/.test(message)) return "text-red-400";
  if (/\bWARN\b|\bwarn\b/.test(message)) return "text-amber-400";
  if (/\bINFO\b|\binfo\b|✓/.test(message)) return "text-green-400";
  return "text-zinc-300";
}
