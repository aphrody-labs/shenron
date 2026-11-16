// SPDX-License-Identifier: Apache-2.0
// Shenron administration: the complete admin dashboard opens in its own native window
// (`studio_open_shenron_admin`), where `window.aphrodyNative` reaches the desktop's local
// models (`studio_native_*`, crates/shenron-studio/src/studio.rs). Outside the desktop app the
// dashboard opens in place.
import { useCallback, useEffect, useState } from "react";
import { adminUrl } from "@shenron/config/admin";
import { StudioHeader } from "./StudioHeader";
import {
  ErrorNote,
  fieldClass,
  ghostButtonClass,
  panelClass,
  primaryButtonClass,
  StatusChip,
} from "./StudioKit";
import { isTauri } from "./tauri-bridge";
import { nativeAi, type NativeAiStatus } from "./studio-bridge";

export function AdminStudio() {
  const [status, setStatus] = useState<NativeAiStatus | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    nativeAi.status().then(setStatus, (cause: unknown) => setError(String(cause)));
  }, []);

  useEffect(() => {
    if (isTauri()) refresh();
  }, [refresh]);

  const open = async () => {
    setError(null);
    try {
      if (isTauri()) await nativeAi.openAdmin(url.trim() || undefined);
      else {
        const target = new URL(url.trim() || adminUrl());
        window.location.assign(
          adminUrl({ SHENRON_PUBLIC_SITE_URL: target.href }, target.pathname + target.search),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const roles: Array<[string, NativeAiStatus["chat"] | undefined]> = [
    ["Chat", status?.chat],
    ["Embeddings", status?.embed],
    ["Rerank", status?.rerank],
  ];

  return (
    <div className="flex flex-col gap-6">
      <StudioHeader
        eyebrow="Fenêtre native"
        title="Administration"
        subtitle="Bot, site, manga, transcriptions et accès, avec les modèles locaux du bureau"
      />
      <div className={panelClass}>
        {isTauri() && (
          <div className="flex flex-wrap items-center gap-3">
            {roles.map(([label, role]) => (
              <StatusChip key={label} ok={role?.ready === true}>
                {label} :{" "}
                {status
                  ? role?.ready
                    ? role.model
                    : "non chargé"
                  : error
                    ? "indisponible"
                    : "lecture en cours"}
              </StatusChip>
            ))}
            <button type="button" className={ghostButtonClass} onClick={refresh}>
              Actualiser
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            aria-label="URL de l’administration"
            className={`${fieldClass} flex-1`}
            placeholder={adminUrl()}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
          />
          <button type="button" className={primaryButtonClass} onClick={() => void open()}>
            Ouvrir l’administration
          </button>
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </div>
  );
}
