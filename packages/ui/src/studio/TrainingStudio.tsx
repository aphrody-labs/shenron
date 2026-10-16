/* oxlint-disable react/exhaustive-effect-dependencies, react/set-state-in-effect, jsx-a11y/prefer-tag-over-role, react/no-array-index-key -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
// Read-only native training environment (`studio_shenron_training`) and the `studio://train`
// events of crates/shenron-studio/src/studio.rs. `studio_shenron_train_start` still runs the
// Python training process, so this UI does not expose that launch path.
import { useEffect, useState } from "react";
import { StudioHeader } from "./StudioHeader";
import { DesktopOnly, ErrorNote, ghostButtonClass, panelClass } from "./StudioKit";
import { isTauri } from "./tauri-bridge";
import { shenron, training, type ShenronTraining, type TrainEvent } from "./studio-bridge";

export interface TrainingStudioBackend {
  isDesktop(): boolean;
  environment(): Promise<ShenronTraining>;
  subscribe(handler: (event: TrainEvent) => void): Promise<() => void | Promise<void>>;
}
const backend: TrainingStudioBackend = {
  isDesktop: isTauri,
  environment: shenron.training,
  subscribe: training.onEvent,
};

function unsubscribe(stop: () => void | Promise<void>) {
  try {
    void Promise.resolve(stop()).catch((error: unknown) => {
      console.warn("Training event cleanup failed", error);
    });
  } catch (error) {
    console.warn("Training event cleanup failed", error);
  }
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function TrainingStudio({ services = backend }: { services?: TrainingStudioBackend } = {}) {
  const desktop = services.isDesktop();
  const [env, setEnv] = useState<ShenronTraining | null>(null);
  const [loading, setLoading] = useState(desktop);
  const [listening, setListening] = useState(false);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [events, setEvents] = useState<TrainEvent[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    let stop: (() => void | Promise<void>) | undefined;
    setLoading(true);
    setListening(false);
    setEnvironmentError(null);
    setEventError(null);
    setEnv(null);
    void services
      .environment()
      .then((report) => {
        if (active) setEnv(report);
        return null;
      })
      .catch((error: unknown) => {
        if (active) setEnvironmentError(message(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void services
      .subscribe((event) => {
        if (active) setEvents((current) => [event, ...current].slice(0, 20));
      })
      .then((unlisten) => {
        if (active) {
          stop = unlisten;
          setListening(true);
        } else unsubscribe(unlisten);
        return null;
      })
      .catch((error: unknown) => {
        if (active) setEventError(message(error));
      });
    return () => {
      active = false;
      if (stop) unsubscribe(stop);
    };
  }, [services, desktop, reload]);

  if (!desktop) {
    return (
      <DesktopOnly>
        L'état de l'entraînement est disponible dans l'application de bureau Shenron.
      </DesktopOnly>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <StudioHeader
        eyebrow="Candidats RAG"
        title="Entraînement"
        subtitle="Environnement et événements des candidats embeddings et reranker"
      />
      <section className={panelClass}>
        <h3 className="text-[18px] font-bold">Environnement</h3>
        {loading && <p role="status">Lecture de l'environnement d'entraînement…</p>}
        {env && (
          <>
            <p>GPU détectés : {env.gpu_count}</p>
            <p>Candidats : {env.candidate_root}</p>
            <p>Projet d'entraînement : {env.python_project ?? "introuvable"}</p>
            <p className="text-os/75">{env.rag_promotion}</p>
          </>
        )}
        {environmentError && <ErrorNote>Environnement indisponible : {environmentError}</ErrorNote>}
      </section>
      <section className={panelClass}>
        <h3 className="text-[18px] font-bold">Événements reçus</h3>
        {eventError ? (
          <ErrorNote>Flux d'événements indisponible : {eventError}</ErrorNote>
        ) : !listening ? (
          <p role="status">Connexion aux événements d'entraînement…</p>
        ) : events.length === 0 ? (
          <p className="text-os/75">Aucun événement reçu depuis l'ouverture de cette vue.</p>
        ) : null}
        {events.length > 0 && (
          <ol className="flex flex-col gap-2">
            {events.map((event, index) => (
              <li key={index} className="rounded-lg border border-os/12 p-3">
                {event.state === "started"
                  ? `Démarré : ${event.kind}, ${event.steps} pas, ${event.baseModel}`
                  : event.state === "finished"
                    ? `Terminé : ${event.kind} → ${event.output}`
                    : `Échec : ${event.kind} — ${event.error}`}
              </li>
            ))}
          </ol>
        )}
      </section>
      {(environmentError || eventError) && (
        <button
          type="button"
          className={`${ghostButtonClass} self-start`}
          onClick={() => setReload((value) => value + 1)}
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
