"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  backend,
  pageKey,
  pagesKey,
  projectKey,
  refresh,
  useProject,
} from "@aphrody/shenron-ui/koharu";
import { commands } from "@aphrody/shenron-koharu/protocol";
import { importStudioFiles, usesHostedStudio } from "@aphrody/shenron-koharu/transport";
import {
  studioSourceSelection,
  studioSourceRecord,
  studioSourceFile,
} from "@/lib/studio-catalogue-source";

type SourceRecord = ReturnType<typeof studioSourceRecord>;
/** An explicit import creates a fresh project; catalogue identifiers never become export bindings. */
export function StudioCatalogueImport() {
  const t = useTranslations("StudioSource");
  const project = useProject();
  const [source, setSource] = useState<SourceRecord | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [provenance, setProvenance] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!usesHostedStudio()) return;
    const selected = studioSourceSelection(new URLSearchParams(window.location.search));
    if (!selected) return;
    const controller = new AbortController();
    const path =
      selected.kind === "chapter"
        ? `/api/manga/chapter/${selected.id}/pages/${selected.page}`
        : `/api/databooks/${selected.id}`;
    void fetch(path, { signal: controller.signal, credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw Error("Catalogue unavailable");
        return response.json();
      })
      .then((value) => {
        const record = studioSourceRecord(selected, value, window.location.origin);
        setSource(record);
        setName(record.name);
        return record;
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  async function importPage() {
    if (!source || busy || project.data || !name.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    try {
      if (await backend.call(commands.getProject)) throw Error("Close the open project first");
      const projects = await backend.call(commands.listProjects);
      if (projects.some((value) => value.name === name.trim()))
        throw Error("Project already exists");
      const file = await studioSourceFile(source.image, controller.signal);
      const sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      controller.signal.throwIfAborted();
      if (await backend.call(commands.getProject)) throw Error("Project changed during import");
      const record = JSON.stringify(
        {
          schema: "shenron.studio-source.v1",
          source,
          sha256,
          bytes: file.size,
          preparedAt: new Date().toISOString(),
          candidateOnly: true,
          editorialBinding: null,
        },
        null,
        2,
      );
      // Keep provenance before creating the project, including failed or interrupted candidates.
      localStorage.setItem(`shenron:studio-source:${name.trim()}`, record);
      setProvenance(record);
      await backend.call(commands.createProject, name.trim());
      await importStudioFiles(
        [new File([file], `${source.name}.${file.name.split(".").pop()}`, { type: file.type })],
        controller.signal,
      );
      await refresh(projectKey, pagesKey, pageKey);
      setDone(true);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      await refresh(projectKey, pagesKey, pageKey).catch(() => setError(true));
      setBusy(false);
    }
  }
  function downloadProvenance() {
    if (!provenance) return;
    const url = URL.createObjectURL(new Blob([provenance], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "studio-source-provenance.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  if (!source && !error) return null;
  return (
    <section
      className="shrink-0 border-b border-border bg-background p-4 text-foreground"
      aria-label={t("title")}
    >
      <h2 className="font-semibold">{t("title")}</h2>
      {source && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <img
            src={source.image}
            alt={t("preview", { page: source.page })}
            className="max-h-28 max-w-24 object-contain"
          />
          <div className="space-y-2">
            <p>{t("selected", { kind: t(source.kind), id: source.id, page: source.page })}</p>
            <label className="flex flex-wrap items-center gap-2">
              {t("destination")}
              <input
                className="min-h-11 rounded border border-border bg-background px-3"
                value={name}
                maxLength={80}
                pattern="[a-zA-Z0-9_-]+"
                onChange={(event) => setName(event.target.value)}
                disabled={busy || done}
              />
            </label>
            <p className="text-sm text-muted-foreground">{t("candidate")}</p>
            {project.data && !done && <p>{t("openProject")}</p>}
            <button
              className="min-h-11 rounded border border-border px-3 disabled:opacity-50"
              type="button"
              disabled={
                busy || done || !!project.data || !/^[a-zA-Z0-9_-]{1,80}$/.test(name.trim())
              }
              onClick={() => void importPage()}
            >
              {t(busy ? "importing" : done ? "imported" : "import")}
            </button>
            {busy && (
              <button
                className="min-h-11 px-3"
                type="button"
                onClick={() => request.current?.abort()}
              >
                {t("cancel")}
              </button>
            )}
            {provenance && (
              <button
                className="min-h-11 px-3 underline"
                type="button"
                onClick={downloadProvenance}
              >
                {t("provenance")}
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert">{t("error")}</p>}
    </section>
  );
}
