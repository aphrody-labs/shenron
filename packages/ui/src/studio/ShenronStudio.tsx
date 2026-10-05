// SPDX-License-Identifier: Apache-2.0
// Shenron studio of the desktop app: one page, four tabs over the Studio commands that
// shenron-desktop registers (crates/shenron-studio, logic owned by shenron-cli::shenron_cmd):
// service health and RAG corpus, the offline databooks corpus, training, administration.
import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../components/tabs";
import { PageHeader } from "../layout/PageHeader";
import { SectionHeading } from "../layout/SectionHeading";
import { AdminStudio } from "./AdminStudio";
import { DatabooksStudio } from "./DatabooksStudio";
import {
  DesktopOnly,
  ErrorNote,
  fieldClass,
  ghostButtonClass,
  panelClass,
  primaryButtonClass,
  rowClass,
  StatusChip,
} from "./StudioKit";
import { TrainingStudio } from "./TrainingStudio";
import { isTauri } from "./tauri-bridge";
import {
  shenron,
  type ShenronHealth,
  type ShenronProbe,
  type ShenronRagHit,
  type ShenronRagStats,
} from "./studio-bridge";

const TABS = [
  ["pilotage", "Pilotage"],
  ["databooks", "Databooks"],
  ["entrainement", "Entraînement"],
  ["administration", "Administration"],
] as const;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ProbeRow({ name, probe }: { name: string; probe: ShenronProbe }) {
  const ok = probe.reachable === true;
  return (
    <li className={rowClass}>
      <span>{name}</span>
      <StatusChip ok={ok}>
        {probe.configured === false ? "non configuré" : ok ? "joignable" : "injoignable"}
      </StatusChip>
    </li>
  );
}

/** Last health and corpus reports; a failed read keeps its message, never a stale value. */
interface Reports {
  health: ShenronHealth | null;
  stats: ShenronRagStats | null;
  errors: { health?: string; stats?: string };
}

/** Health of the services and the serving RAG corpus (`studio_shenron_*`). */
function Pilotage({
  reports: { health, stats, errors },
  refreshing,
  onRefresh,
}: {
  reports: Reports;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ShenronRagHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setSearchError(null);
    try {
      setHits((await shenron.ragSearch(query.trim(), 10)).results);
    } catch (cause) {
      setSearchError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <SectionHeading
          level={3}
          title="Santé des services"
          actions={
            <button
              type="button"
              className={ghostButtonClass}
              disabled={refreshing}
              onClick={onRefresh}
            >
              Actualiser
            </button>
          }
        />
        {errors.health ? <ErrorNote>{errors.health}</ErrorNote> : null}
        {health ? (
          <ul className="grid gap-3 md:grid-cols-2">
            <ProbeRow name="Site" probe={health.site} />
            <ProbeRow name="Bot" probe={health.bot} />
            <ProbeRow name="IA Aphrody" probe={health.aphrody_ai_http} />
            <li className={rowClass}>
              <span>Agent Home dbfr</span>
              <StatusChip ok={health.agent_home.valid}>
                {health.agent_home.valid ? `${health.agent_home.files ?? 0} fichiers` : "invalide"}
              </StatusChip>
            </li>
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading
          level={3}
          title="Corpus RAG"
          standfirst={health ? `Moteur : ${health.rag_backend}` : undefined}
        />
        {errors.stats ? <ErrorNote>{errors.stats}</ErrorNote> : null}
        {stats ? (
          <div className={panelClass}>
            <p className="tabular-nums">
              {stats.chunks} passages · {stats.vectors} vecteurs
            </p>
            {stats.sources?.length ? (
              <ul className="grid gap-2 md:grid-cols-2">
                {stats.sources.map((source) => (
                  <li
                    key={`${source.kind}:${source.sourceId}`}
                    className="rounded-lg border border-os/12 p-3 tabular-nums"
                  >
                    [{source.kind}] {source.sourceId} : {source.count}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <input
            aria-label="Recherche dans le corpus Shenron"
            className={`${fieldClass} flex-1`}
            placeholder="Rechercher (ex. Goku Super Saiyan)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className={primaryButtonClass}
            type="submit"
            disabled={busy || query.trim().length < 2}
          >
            Rechercher
          </button>
        </form>
        {searchError ? <ErrorNote>{searchError}</ErrorNote> : null}
        <ol className="flex flex-col gap-3">
          {hits.map((hit, index) => (
            <li key={`${hit.url ?? hit.title}-${index}`} className={panelClass}>
              <p className="font-semibold">
                [{hit.kind ?? "document"}] {hit.title ?? "Sans titre"}
              </p>
              {hit.snippet ? <p className="text-os/75">{hit.snippet}</p> : null}
              {hit.url ? <p className="break-all text-[14px] text-os/60">{hit.url}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

async function settle<T>(task: () => Promise<T>): Promise<[T | null, string | undefined]> {
  try {
    return [await task(), undefined];
  } catch (cause) {
    return [null, message(cause)];
  }
}

export function ShenronStudio() {
  const [reports, setReports] = useState<Reports>({ health: null, stats: null, errors: {} });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    const [[health, healthError], [stats, statsError]] = await Promise.all([
      settle(shenron.health),
      settle(shenron.ragStats),
    ]);
    setReports({ health, stats, errors: { health: healthError, stats: statsError } });
    setBusy(false);
  }, []);

  useEffect(() => {
    if (isTauri()) void refresh();
  }, [refresh]);

  if (!isTauri()) {
    return (
      <DesktopOnly>Le studio Shenron fonctionne dans l’application de bureau Shenron.</DesktopOnly>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className=""
        size="md"
        eyebrow="Shenron"
        title="Studio"
        subtitle={
          reports.errors.health
            ? "Santé indisponible"
            : reports.health
              ? reports.health.status === "operational"
                ? "Opérationnel"
                : "Dégradé"
              : "Chargement…"
        }
      />

      <Tabs defaultValue="pilotage">
        <TabsList aria-label="Sections du studio">
          {TABS.map(([value, label]) => (
            <TabsTab key={value} value={value} className="min-h-11">
              {label}
            </TabsTab>
          ))}
        </TabsList>
        <TabsPanel value="pilotage">
          <Pilotage reports={reports} refreshing={busy} onRefresh={() => void refresh()} />
        </TabsPanel>
        <TabsPanel value="databooks">
          <DatabooksStudio />
        </TabsPanel>
        <TabsPanel value="entrainement">
          <TrainingStudio />
        </TabsPanel>
        <TabsPanel value="administration">
          <AdminStudio />
        </TabsPanel>
      </Tabs>
    </div>
  );
}
