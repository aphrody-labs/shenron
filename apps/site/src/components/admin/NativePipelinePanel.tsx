// SPDX-License-Identifier: Apache-2.0
"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  NativePipelinePanel as Panel,
  type NativePipelineSnapshot,
} from "@aphrody/shenron-ui/admin/NativePipelinePanel";
import { api } from "@/lib/admin-api";
import { z } from "zod";

const Snapshot = z.object({
  native: z.object({
    abi: z.number().int().nullable(),
    version: z.string().nullable(),
    bun: z.string(),
    rag: z
      .object({
        chunks: z.number().int().nonnegative(),
        vectors: z.number().int().nonnegative(),
        ragReady: z.boolean().nullable(),
      })
      .nullable()
      .optional(),
  }),
  actions: z
    .array(
      z.object({
        id: z.string(),
        category: z.enum(["rag", "crawl", "llm", "training", "docker", "pipeline"]),
        target: z.enum(["vps", "dbfr", "fleet"]),
        available: z.boolean(),
        concurrent: z.boolean().optional(),
      }),
    )
    .max(64),
  jobs: z
    .array(
      z.object({
        id: z.string(),
        action: z.string(),
        state: z.enum([
          "submitting",
          "queued",
          "running",
          "succeeded",
          "failed",
          "cancelled",
          "interrupted",
          "timed-out",
        ]),
        startedAt: z.string(),
        finishedAt: z.string().nullable(),
        code: z.number().int().nullable(),
        host: z.string().nullable().optional(),
        remoteId: z.string().nullable().optional(),
      }),
    )
    .max(50),
});

export function NativePipelinePanel() {
  const t = useTranslations("adminDashboard.nativePipeline");
  const [wasmState, setWasmState] = useState<"idle" | "ready" | "failed">("idle");
  const [wasmPending, setWasmPending] = useState(false);
  const query = useQuery({
    queryKey: ["admin", "native-pipeline"],
    queryFn: async () => Snapshot.parse(await api.get<NativePipelineSnapshot>("/admin/pipeline")),
    refetchInterval: 10_000,
  });
  const mutation = useMutation({
    mutationFn: ({ action, id, cancel }: { action?: string; id: string; cancel?: boolean }) =>
      cancel
        ? api.post(`/admin/pipeline/${encodeURIComponent(id)}/cancel`)
        : api.post("/admin/pipeline", { action, id }),
    onSettled: () => {
      void query.refetch();
    },
  });
  const states = Object.fromEntries(
    [
      "submitting",
      "queued",
      "running",
      "succeeded",
      "failed",
      "cancelled",
      "interrupted",
      "timed-out",
      "cancelling",
    ].map((state) => [state, t(`states.${state}`)]),
  );
  const categories = Object.fromEntries(
    ["rag", "crawl", "llm", "training", "docker", "pipeline"].map((category) => [
      category,
      t(`categories.${category}`),
    ]),
  );
  async function checkWasm() {
    setWasmPending(true);
    try {
      const wasm = await import("@aphrody/shenron-pipeline/re-wasm-web");
      await wasm.initShenronReWeb(`/wasm/${wasm.SHENRON_RE_WASM_FILENAME}`);
      // Valid empty #PUP file: execute the compiled Rust parser, not just a download.
      const bytes = new Uint8Array(16);
      bytes.set([0x23, 0x50, 0x55, 0x50, 0xfe, 0xff, 0x10, 0]);
      new DataView(bytes.buffer).setUint32(12, 16, true);
      const result = wasm.parseGameDataFile("pup", bytes);
      if (result.recordCount !== 0) throw new Error("Invalid parser result");
      setWasmState("ready");
    } catch {
      setWasmState("failed");
    } finally {
      setWasmPending(false);
    }
  }
  return (
    <Panel
      snapshot={query.data}
      pending={query.isFetching || mutation.isPending || wasmPending}
      error={query.isError || mutation.isError}
      wasmState={wasmState}
      labels={{
        title: t("title"),
        description: t("description"),
        refresh: t("refresh"),
        run: t("run"),
        cancel: t("cancel"),
        unavailable: t("unavailable"),
        empty: t("empty"),
        wasm: t("wasm"),
        wasmReady: t("wasmReady"),
        wasmFailed: t("wasmFailed"),
        states,
        categories,
        ragCounts: (chunks, vectors) => t("ragCounts", { chunks, vectors }),
      }}
      onRefresh={() => {
        void query.refetch();
      }}
      onWasm={() => {
        void checkWasm();
      }}
      onRun={(action) => mutation.mutate({ action, id: crypto.randomUUID() })}
      onCancel={(id) => mutation.mutate({ id, cancel: true })}
    />
  );
}
