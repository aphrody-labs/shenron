// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Start page of the desktop app: the local Dragon Ball corpus (served by shenron-server's
 * /api/local/rag/search through the shenron-ffi engine), the manga translation editor, the
 * studio and the public site. Works offline; the public site opens in the system browser.
 */
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { isTauri } from "@shenron/ui/studio/tauri-bridge";

const PUBLIC_SITE = "https://dragonballfr.com";

interface LocalHit {
  rowid: string;
  kind: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
}

interface Health {
  ok: boolean;
  version: string;
  profile: string;
  localRag: boolean;
  localRagError?: string;
}

async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@aphrody/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function DesktopHome() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LocalHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/local/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok && response.status !== 503) throw new Error(`HTTP ${response.status}`);
        setHealth((await response.json()) as Health);
      })
      .catch(() =>
        setHealthError(
          "Le serveur local de Shenron ne répond pas (application de bureau requise).",
        ),
      );
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(`/api/local/rag/search?q=${encodeURIComponent(q)}&limit=12`, {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        results?: LocalHit[];
        error?: string;
        tookMs?: number;
      };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setHits(body.results ?? []);
      setTookMs(body.tookMs ?? null);
    } catch (error) {
      setHits(null);
      setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Shenron sur votre ordinateur</h1>
        <p className="text-[var(--dbz-text-muted,#a39e93)]">
          {health
            ? `Serveur local ${health.version} · profil ${health.profile} · recherche locale ${health.localRag ? "disponible" : "indisponible"}`
            : (healthError ?? "Connexion au serveur local…")}
        </p>
      </header>

      <section className="card flex flex-col gap-4 p-6" aria-labelledby="recherche-locale">
        <h2 id="recherche-locale" className="text-xl font-bold">
          Recherche dans le corpus Dragon Ball (hors ligne)
        </h2>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={search}>
          <label className="sr-only" htmlFor="q">
            Question ou mot-clé
          </label>
          <input
            id="q"
            className="input flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex. : Kaméhaméha, Freezer, databook Daizenshû 2"
            maxLength={600}
          />
          <button className="btn btn-primary" type="submit" disabled={searching || !query.trim()}>
            {searching ? "Recherche…" : "Rechercher"}
          </button>
        </form>
        {health && !health.localRag ? (
          <p role="alert">Recherche locale indisponible : {health.localRagError}</p>
        ) : null}
        {searchError ? <p role="alert">Échec de la recherche : {searchError}</p> : null}
        {hits ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {hits.length} passage(s){tookMs !== null ? ` en ${tookMs} ms` : ""}
            </p>
            <ol className="flex flex-col gap-3">
              {hits.map((hit) => (
                <li
                  key={hit.rowid}
                  className="flex flex-col gap-1 border-b border-[var(--dbz-border,#2a2a26)] pb-3"
                >
                  <button
                    type="button"
                    className="text-left font-semibold underline-offset-4 hover:underline"
                    onClick={() => void openExternal(hit.url)}
                  >
                    {hit.title}
                  </button>
                  <span className="text-xs uppercase tracking-wide">{hit.kind}</span>
                  <p className="text-sm">{hit.snippet}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Outils">
        <Link href="/studio" className="card flex flex-col gap-2 p-6">
          <span className="text-lg font-bold">Éditeur de traduction manga</span>
          <span className="text-sm">
            Détection, OCR, traduction, nettoyage et export PSD des planches (Shenron Studio).
          </span>
        </Link>
        <Link href="/desktop/control" className="card flex flex-col gap-2 p-6">
          <span className="text-lg font-bold">Pilotage</span>
          <span className="text-sm">
            Santé des services, corpus, modèles locaux et entraînement.
          </span>
        </Link>
        <button
          type="button"
          className="card flex flex-col gap-2 p-6 text-left"
          onClick={() => void openExternal(PUBLIC_SITE)}
        >
          <span className="text-lg font-bold">dragonballfr.com</span>
          <span className="text-sm">
            Le site public complet (wiki, manga, databooks, actualités) dans votre navigateur.
          </span>
        </button>
      </section>
    </main>
  );
}
