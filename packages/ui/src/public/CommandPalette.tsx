"use client";

/** Shared search palette; hosts own navigation, asset resolution and telemetry. */
import { DragonBallLoader } from "../toriyama";
import { DragonRadar } from "../icones";
import { Command } from "cmdk";
import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCommandPaletteMessages, paletteText } from "./command-palette-messages";
import { getDragonRadarMessages } from "./dragon-radar-messages";
import { startSearchSession } from "./search-session";

/** Public search response, with no server or database imports. */
export type SearchResults = {
  q: string;
  characters: Array<{
    id: number;
    name: string;
    name_ja: string | null;
    image: string | null;
    race: string | null;
  }>;
  planets: Array<{
    id: number;
    name: string;
    name_ja: string | null;
    image: string | null;
  }>;
  sagas: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    series: string | null;
  }>;
  movies: Array<{
    id: number;
    slug: string;
    title: string;
    title_ja: string | null;
    series: string | null;
  }>;
  games: Array<{
    id: number;
    slug: string;
    title: string;
    title_ja: string | null;
  }>;
  episodes: Array<{
    id: number;
    series: string;
    number_in_series: number;
    title: string;
    image: string | null;
  }>;
  techniques: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    type: string | null;
  }>;
  races: Array<{ id: number; slug: string; name: string; name_ja: string | null }>;
  transformations: Array<{ id: number; name: string; image: string | null; character_id: number }>;
  arcs: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    saga_slug: string | null;
  }>;
  mangaVolumes: Array<{
    id: number;
    series: string;
    volume_number: number | null;
    title: string | null;
    cover: string | null;
  }>;
  mangaChapters: Array<{
    id: number;
    series: string;
    chapter_number: number | null;
    title: string | null;
  }>;
  battles: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    saga: string;
  }>;
  locations: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    realm_type: string;
    image: string | null;
  }>;
  tournaments: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    saga: string;
  }>;
  voiceActors: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    nationality: string;
  }>;
  soundtracks: Array<{
    id: number;
    slug: string;
    title: string;
    title_ja: string | null;
    track_type: string;
    series: string;
  }>;
  powerLevels: Array<{
    id: number;
    character_name: string;
    battle_or_context: string | null;
    power_value_formatted: string;
  }>;
  items: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    category: string;
    image: string | null;
  }>;
  dragons: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    creator: string | null;
    image: string | null;
  }>;
  contributors?: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    category: string;
  }>;
  sources: Array<{ url: string; kind: string; title: string; excerpt: string; httpStatus: number }>;
  databooks: Array<{
    id: number;
    title: string;
    title_ja: string | null;
    category: string | null;
    cover: string | null;
  }>;
  novels: Array<{
    id: number;
    title: string;
    title_ja: string | null;
    publication_type: string;
    cover: string | null;
  }>;
};

const EMPTY: SearchResults = {
  q: "",
  characters: [],
  planets: [],
  sagas: [],
  movies: [],
  games: [],
  episodes: [],
  techniques: [],
  races: [],
  transformations: [],
  arcs: [],
  mangaVolumes: [],
  mangaChapters: [],
  battles: [],
  locations: [],
  tournaments: [],
  voiceActors: [],
  soundtracks: [],
  powerLevels: [],
  items: [],
  dragons: [],
  contributors: [],
  sources: [],
  databooks: [],
  novels: [],
};

function count(r: SearchResults): number {
  return (
    r.characters.length +
    r.planets.length +
    r.sagas.length +
    r.movies.length +
    r.games.length +
    r.episodes.length +
    r.techniques.length +
    r.races.length +
    r.transformations.length +
    r.arcs.length +
    r.mangaVolumes.length +
    r.mangaChapters.length +
    r.battles.length +
    r.locations.length +
    r.tournaments.length +
    r.voiceActors.length +
    r.soundtracks.length +
    r.powerLevels.length +
    r.items.length +
    r.dragons.length +
    (r.contributors?.length ?? 0) +
    r.sources.length +
    r.databooks.length +
    r.novels.length
  );
}

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: string;
  navigate: (href: string) => void;
  resolveAsset?: (image: string) => string;
  onSearch?: (query: string, resultCount: number) => void;
  searchUrl?: string;
};
const identityAsset = (image: string) => image;

export function CommandPalette({
  open,
  onOpenChange,
  locale,
  navigate,
  resolveAsset = identityAsset,
  onSearch,
  searchUrl = "/api/search",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const searchObserver = useRef(onSearch);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchObserver.current = onSearch;
  }, [onSearch]);
  const messages = getDragonRadarMessages(locale);
  const palette = getCommandPaletteMessages(locale);

  useEffect(() => {
    const term = query.trim();
    // Reset the network session when its query, visibility or retry changes.
    // oxlint-disable-next-line react/set-state-in-effect
    setFailed(false);
    setResults(EMPTY);
    if (!open || term.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    return startSearchSession(
      async (signal) => {
        const res = await fetch(
          `${searchUrl}${searchUrl.includes("?") ? "&" : "?"}q=${encodeURIComponent(term)}`,
          {
            signal,
          },
        );
        if (!res.ok) throw new Error(String(res.status));
        const recus = (await res.json()) as SearchResults;
        if (
          !recus ||
          Object.keys(EMPTY).some(
            (key) => key !== "q" && !Array.isArray(recus[key as keyof SearchResults]),
          )
        )
          throw new Error("Invalid search response");
        return recus;
      },
      {
        success: (recus) => {
          setResults(recus);
          searchObserver.current?.(term, count(recus));
        },
        failure: () => setFailed(true),
        settled: () => setLoading(false),
      },
    );
    // Retry intentionally starts a new session even when the query is unchanged.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [query, open, attempt, searchUrl]);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      setQuery("");
      setResults(EMPTY);
      navigate(href);
    },
    [navigate, onOpenChange],
  );

  const total = count(results);
  const term = query.trim();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" />
        <Dialog.Popup
          aria-label={palette.label}
          initialFocus={inputRef}
          className="fixed left-1/2 top-[12vh] z-[101] w-[92vw] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-dbz-border bg-dbz-card/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <Command label={palette.label} shouldFilter={false} loop>
            <div className="flex items-center gap-3 border-b border-dbz-border px-4">
              <DragonRadar size={20} className="text-dbz-orange/70 shrink-0" />
              <Command.Input
                ref={inputRef}
                aria-label={palette.label}
                value={query}
                onValueChange={setQuery}
                placeholder={palette.placeholder}
                className="h-14 w-full bg-transparent text-white placeholder:text-white/50 font-display text-base outline-none"
              />
              {loading && (
                <span className="shrink-0">
                  <DragonBallLoader size={18} stars={4} decorative />
                </span>
              )}
            </div>

            <output aria-live="polite" aria-atomic="true" className="sr-only">
              {loading
                ? messages.loading
                : term.length >= 2 && !failed
                  ? paletteText(palette, total === 1 ? "resultOne" : "resultCount", {
                      count: total,
                    })
                  : ""}
            </output>

            <Command.List
              aria-busy={loading}
              className="max-h-[60vh] overflow-y-auto overscroll-contain p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-white/50"
            >
              {failed && (
                <div role="alert" className="px-3 py-6 text-center text-sm text-white/70">
                  <p>{messages.error}</p>
                  <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                    {messages.retry}
                  </button>
                </div>
              )}
              {term.length >= 2 && !loading && !failed && total === 0 && (
                <p className="px-3 py-10 text-center text-sm text-white/50">
                  {palette.emptyBefore}
                  <span className="text-dbz-orange">{term}</span>
                  {palette.emptyAfter}
                </p>
              )}
              {term.length < 2 && (
                <p className="px-3 py-10 text-center text-sm text-white/50">{palette.shortQuery}</p>
              )}

              {results.characters.length > 0 && (
                <Command.Group heading={palette.hCharacters}>
                  {results.characters.map((c) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`char-${c.id}`}
                      value={`char-${c.id}-${c.name}`}
                      onSelect={() => go(`/wiki/characters/${c.id}`)}
                      image={c.image}
                      title={c.name}
                      subtitle={c.name_ja ?? c.race ?? undefined}
                      kind={palette.kCharacter}
                      accent="orange"
                    />
                  ))}
                </Command.Group>
              )}

              {results.planets.length > 0 && (
                <Command.Group heading={palette.hPlanets}>
                  {results.planets.map((p) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`planet-${p.id}`}
                      value={`planet-${p.id}-${p.name}`}
                      onSelect={() => go("/wiki/locations")}
                      image={p.image}
                      title={p.name}
                      subtitle={p.name_ja ?? undefined}
                      kind={palette.kLocation}
                      accent="blue"
                    />
                  ))}
                </Command.Group>
              )}

              {results.sagas.length > 0 && (
                <Command.Group heading={palette.hSagas}>
                  {results.sagas.map((s) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`saga-${s.id}`}
                      value={`saga-${s.id}-${s.name}`}
                      onSelect={() => go(`/wiki/sagas/${s.slug}`)}
                      title={s.name}
                      subtitle={s.series ?? undefined}
                      kind={palette.kSaga}
                      accent="orange"
                    />
                  ))}
                </Command.Group>
              )}

              {results.movies.length > 0 && (
                <Command.Group heading={palette.hMovies}>
                  {results.movies.map((m) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`movie-${m.id}`}
                      value={`movie-${m.id}-${m.title}`}
                      onSelect={() => go(`/wiki/movies/${m.slug}`)}
                      title={m.title}
                      subtitle={m.title_ja ?? m.series ?? undefined}
                      kind={palette.kMovie}
                      accent="red"
                    />
                  ))}
                </Command.Group>
              )}

              {results.games.length > 0 && (
                <Command.Group heading={palette.hGames}>
                  {results.games.map((g) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`game-${g.id}`}
                      value={`game-${g.id}-${g.title}`}
                      onSelect={() => go(`/wiki/games/${g.slug}`)}
                      title={g.title}
                      subtitle={g.title_ja ?? undefined}
                      kind={palette.kGame}
                      accent="blue"
                    />
                  ))}
                </Command.Group>
              )}

              {results.episodes.length > 0 && (
                <Command.Group heading={palette.hEpisodes}>
                  {results.episodes.map((e) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`ep-${e.id}`}
                      value={`ep-${e.id}-${e.title}`}
                      onSelect={() => go(`/wiki/episodes/${e.id}`)}
                      image={e.image}
                      title={e.title}
                      subtitle={paletteText(palette, "episodeSubtitle", {
                        series: e.series,
                        number: e.number_in_series,
                      })}
                      kind={palette.kEpisode}
                      accent="blue"
                    />
                  ))}
                </Command.Group>
              )}

              {results.techniques.length > 0 && (
                <Command.Group heading={palette.hTechniques}>
                  {results.techniques.map((t) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`tech-${t.id}`}
                      value={`tech-${t.id}-${t.name}`}
                      onSelect={() => go(`/wiki/techniques/${t.slug}`)}
                      title={t.name}
                      subtitle={t.name_ja ?? t.type ?? undefined}
                      kind={palette.kTechnique}
                      accent="orange"
                    />
                  ))}
                </Command.Group>
              )}

              {results.races.length > 0 && (
                <Command.Group heading={palette.hRaces}>
                  {results.races.map((r) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`race-${r.id}`}
                      value={`race-${r.id}-${r.name}`}
                      onSelect={() => go(`/wiki/races/${r.slug}`)}
                      title={r.name}
                      subtitle={r.name_ja ?? undefined}
                      kind={palette.kRace}
                      accent="purple"
                    />
                  ))}
                </Command.Group>
              )}

              {results.transformations.length > 0 && (
                <Command.Group heading={palette.hTransformations}>
                  {results.transformations.map((t) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`transfo-${t.id}`}
                      value={`transfo-${t.id}-${t.name}`}
                      onSelect={() => go(`/wiki/characters/${t.character_id}`)}
                      image={t.image}
                      title={t.name}
                      kind={palette.kTransformation}
                      accent="orange"
                    />
                  ))}
                </Command.Group>
              )}

              {results.arcs.length > 0 && (
                <Command.Group heading={palette.hArcs}>
                  {results.arcs.map((a) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`arc-${a.id}`}
                      value={`arc-${a.id}-${a.name}`}
                      onSelect={() => go(`/wiki/arcs/${a.slug}`)}
                      title={a.name}
                      subtitle={a.name_ja ?? undefined}
                      kind={palette.kArc}
                      accent="red"
                    />
                  ))}
                </Command.Group>
              )}

              {results.mangaVolumes.length > 0 && (
                <Command.Group heading={palette.hVolumes}>
                  {results.mangaVolumes.map((v) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`vol-${v.id}`}
                      value={`vol-${v.id}-${v.title ?? v.volume_number}`}
                      onSelect={() => go(`/wiki/manga/volume/${v.id}`)}
                      image={v.cover}
                      title={`${paletteText(palette, "volume", { number: v.volume_number ?? "" })}${v.title ? ` — ${v.title}` : ""}`}
                      subtitle={v.series}
                      kind={palette.kVolume}
                      accent="blue"
                    />
                  ))}
                </Command.Group>
              )}

              {results.mangaChapters.length > 0 && (
                <Command.Group heading={palette.hChapters}>
                  {results.mangaChapters.map((c) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`chap-${c.id}`}
                      value={`chap-${c.id}-${c.title ?? c.chapter_number}`}
                      onSelect={() => go(`/wiki/manga/${c.id}`)}
                      title={`${paletteText(palette, "chapter", { number: c.chapter_number ?? "" })}${c.title ? ` — ${c.title}` : ""}`}
                      subtitle={c.series}
                      kind={palette.kChapter}
                      accent="blue"
                    />
                  ))}
                </Command.Group>
              )}

              {results.battles.length > 0 && (
                <Command.Group heading={palette.hBattles}>
                  {results.battles.map((b) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`battle-${b.id}`}
                      value={`battle-${b.id}-${b.name}`}
                      onSelect={() => go("/wiki/events")}
                      title={b.name}
                      subtitle={b.name_ja ?? b.saga ?? undefined}
                      kind={palette.kBattle}
                      accent="red"
                    />
                  ))}
                </Command.Group>
              )}

              {results.locations.length > 0 && (
                <Command.Group heading={palette.hLocations}>
                  {results.locations.map((l) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`loc-${l.id}`}
                      value={`loc-${l.id}-${l.name}`}
                      onSelect={() => go(`/wiki/locations/${l.slug}`)}
                      image={l.image}
                      title={l.name}
                      subtitle={l.name_ja ?? l.realm_type ?? undefined}
                      kind={palette.kLocation}
                      accent="green"
                    />
                  ))}
                </Command.Group>
              )}

              {results.tournaments.length > 0 && (
                <Command.Group heading={palette.hTournaments}>
                  {results.tournaments.map((t) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`tourn-${t.id}`}
                      value={`tourn-${t.id}-${t.name}`}
                      onSelect={() => go("/wiki/events")}
                      title={t.name}
                      subtitle={t.name_ja ?? t.saga ?? undefined}
                      kind={palette.kTournament}
                      accent="orange"
                    />
                  ))}
                </Command.Group>
              )}

              {results.voiceActors.length > 0 && (
                <Command.Group heading={palette.hVoiceActors}>
                  {results.voiceActors.map((va) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`va-${va.id}`}
                      value={`va-${va.id}-${va.name}`}
                      onSelect={() => go("/wiki/staff")}
                      title={va.name}
                      subtitle={
                        va.name_ja ??
                        (va.nationality === "ja" ? palette.japaneseVoice : palette.frenchVoice)
                      }
                      kind={palette.kVoiceActor}
                      accent="purple"
                    />
                  ))}
                </Command.Group>
              )}

              {results.contributors && results.contributors.length > 0 && (
                <Command.Group heading={palette.hContributors}>
                  {results.contributors.map((c) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`contrib-${c.id}`}
                      value={`contrib-${c.id}-${c.name}`}
                      onSelect={() =>
                        go(
                          c.slug === "akira-toriyama"
                            ? "/wiki/toriyama"
                            : `/wiki/contributors/${c.slug}`,
                        )
                      }
                      title={c.name}
                      subtitle={c.name_ja ? `${c.name_ja} · ${c.category}` : c.category}
                      kind={palette.kContributor}
                      accent="orange"
                    />
                  ))}
                </Command.Group>
              )}

              {results.soundtracks.length > 0 && (
                <Command.Group heading={palette.hSoundtracks}>
                  {results.soundtracks.map((s) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`ost-${s.id}`}
                      value={`ost-${s.id}-${s.title}`}
                      onSelect={() => go(`/wiki/music`)}
                      title={s.title}
                      subtitle={s.title_ja ?? s.series ?? undefined}
                      kind={palette.kSoundtrack}
                      accent="blue"
                    />
                  ))}
                </Command.Group>
              )}

              {results.powerLevels.length > 0 && (
                <Command.Group heading={palette.hPowerLevels}>
                  {results.powerLevels.map((p) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`pl-${p.id}`}
                      value={`pl-${p.id}-${p.character_name}-${p.battle_or_context ?? ""}`}
                      onSelect={() => go(`/wiki/power-levels`)}
                      title={`${p.character_name} : ${p.power_value_formatted}`}
                      subtitle={p.battle_or_context || undefined}
                      kind={palette.kPowerLevel}
                      accent="red"
                    />
                  ))}
                </Command.Group>
              )}

              {results.items.length > 0 && (
                <Command.Group heading={palette.hItems}>
                  {results.items.map((i) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`item-${i.id}`}
                      value={`item-${i.id}-${i.name}`}
                      onSelect={() => go(`/wiki/items/${i.slug}`)}
                      image={i.image}
                      title={i.name}
                      subtitle={i.name_ja ?? i.category ?? undefined}
                      kind={palette.kItem}
                      accent="green"
                    />
                  ))}
                </Command.Group>
              )}

              {results.dragons.length > 0 && (
                <Command.Group heading={palette.hDragons}>
                  {results.dragons.map((d) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`dragon-${d.id}`}
                      value={`dragon-${d.id}-${d.name}`}
                      onSelect={() => go(`/wiki/dragons#${d.slug}`)}
                      image={d.image}
                      title={d.name}
                      subtitle={
                        d.name_ja ??
                        (d.creator
                          ? paletteText(palette, "creator", { name: d.creator })
                          : undefined)
                      }
                      kind={palette.kDragon}
                      accent="orange"
                    />
                  ))}
                </Command.Group>
              )}

              {results.databooks.length > 0 && (
                <Command.Group heading={palette.hDatabooks}>
                  {results.databooks.map((book) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`databook-${book.id}`}
                      value={`databook-${book.id}-${book.title}`}
                      onSelect={() => go(`/wiki/databooks/${book.id}`)}
                      image={book.cover}
                      title={book.title}
                      subtitle={book.title_ja ?? book.category ?? undefined}
                      kind={palette.kDatabook}
                      accent="blue"
                    />
                  ))}
                </Command.Group>
              )}
              {results.novels.length > 0 && (
                <Command.Group heading={palette.hNovels}>
                  {results.novels.map((book) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`novel-${book.id}`}
                      value={`novel-${book.id}-${book.title}`}
                      onSelect={() => go("/wiki/manga")}
                      image={book.cover}
                      title={book.title}
                      subtitle={book.title_ja ?? undefined}
                      kind={palette.kNovel}
                      accent="purple"
                    />
                  ))}
                </Command.Group>
              )}
              {results.sources.length > 0 && (
                <Command.Group heading={palette.hSources}>
                  {results.sources.map((source) => (
                    <Item
                      resolveAsset={resolveAsset}
                      key={`source-${source.url}`}
                      value={`source-${source.url}-${source.title}`}
                      onSelect={() => go(`/sources/dragon-ball?q=${encodeURIComponent(term)}`)}
                      title={source.title}
                      subtitle={`${source.kind} · HTTP ${source.httpStatus}`}
                      kind={palette.kSource}
                      accent="purple"
                    />
                  ))}
                </Command.Group>
              )}

              {/* Preserve full-search and assistant links even when there are no matches. */}
              {term.length >= 2 && (
                <Command.Group heading={palette.hFurther}>
                  <Item
                    resolveAsset={resolveAsset}
                    value={`tous-${term}`}
                    onSelect={() => go(`/wiki/search?q=${encodeURIComponent(term)}`)}
                    title={paletteText(palette, "allResults", { query: term })}
                    kind={palette.kSearch}
                    accent="orange"
                  />
                  <Item
                    resolveAsset={resolveAsset}
                    value={`ask-${term}`}
                    onSelect={() => go(`/ask?q=${encodeURIComponent(term)}`)}
                    title={palette.ask}
                    subtitle={palette.askSubtitle}
                    kind={palette.kAssistant}
                    accent="purple"
                  />
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const ACCENT = {
  orange: "group-data-[selected=true]:text-dbz-orange",
  blue: "group-data-[selected=true]:text-dbz-blue-light",
  red: "group-data-[selected=true]:text-dbz-red",
  purple: "group-data-[selected=true]:text-purple-400",
  green: "group-data-[selected=true]:text-emerald-400",
} as const;

function Item({
  resolveAsset,
  value,
  onSelect,
  image,
  title,
  subtitle,
  kind,
  accent,
}: {
  resolveAsset: (image: string) => string;
  value: string;
  onSelect: () => void;
  image?: string | null;
  title: string;
  subtitle?: string;
  kind: string;
  accent: keyof typeof ACCENT;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 data-[selected=true]:bg-white/[0.06]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-dbz-bg ring-1 ring-white/10">
        {image ? (
          <img
            src={resolveAsset(image)}
            alt=""
            className="h-full w-full object-cover object-top"
            loading="lazy"
          />
        ) : (
          <span className="font-saiyan text-xs text-white/25">{title.charAt(0)}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm font-medium text-white/90">
          {title}
        </span>
        {subtitle && (
          <span className="block truncate font-display text-[11px] text-white/50">{subtitle}</span>
        )}
      </span>
      <span
        className={`shrink-0 font-display text-[9px] font-bold uppercase tracking-[0.2em] text-white/25 transition-colors ${ACCENT[accent]}`}
      >
        {kind}
      </span>
    </Command.Item>
  );
}
