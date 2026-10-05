"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pagination } from "@/components/kit/Pagination";
import { CharacterCardGrid, CharacterPosterCard } from "@/components/wiki/CharacterPosterCard";
import {
  WikiFacet,
  WikiListLayout,
  WikiSearchField,
  WikiSegmented,
  normaliser as norm,
  type FacetOption,
} from "@/components/wiki/WikiListLayout";
import type { AccessSnapshot } from "@/lib/wiki-launch";
import { comparerRichesse } from "@/lib/character-richesse";

// Grille personnages filtrable (client). Importe `@/lib/assets` (client-safe),
// JAMAIS db-universe/shenron (server-only → `postgres` fuiterait dans le bundle).
export type GridCharacter = {
  id: number;
  slug?: string;
  name: string;
  nameJa: string | null;
  race: string | null;
  image: string | null;
  /** Portrait XV2 — repli d'image quand `image` 404 (cf. WikiImg). */
  portraitXv2?: string | null;
  /**
   * Note de richesse mesurée (`@/lib/character-richesse`), calculée côté
   * serveur. Sert au tri par défaut et à la jauge de la carte ; absente, la
   * grille retombe sur l'ordre alphabétique.
   */
  richesse?: number;
};

/**
 * Facettes de filtrage servies par `dbUniverse.characterFacets()` (server) :
 * options Techniques/Arcs + mappings perso→techniques/arcs (sparse) pour le
 * filtrage cumulatif client. Optionnel : la grille dégrade en filtre Race seul
 * si la DB n'a pas répondu.
 */
/**
 * Version d'un personnage rattachée à une saga, affichée comme une carte à
 * part entière — « Goku (Saga Namek) ».
 *
 * Ces 451 versions n'existaient que dans l'onglet « Au fil des sagas » d'une
 * fiche : pour les voir il fallait déjà savoir de qui l'on parle. Dans la
 * grille, elles deviennent parcourables et filtrables comme le reste, et
 * chacune peut porter sa propre illustration.
 */
export type GridVariant = {
  id: number;
  characterId: number;
  name: string;
  saga: string;
  sagaId: number;
  /** Illustration propre à la version ; `null` = celle du personnage. */
  image: string | null;
  characterImage: string | null;
  race: string | null;
  form: string | null;
};

export type CharacterFacets = {
  techniqueOptions: FacetOption[];
  arcOptions: FacetOption[];
  charTechniques: Record<string, string[]>;
  charArcs: Record<string, string[]>;
};

export function CharacterGrid({
  characters,
  nbVariants = 0,
  facets,
  access,
}: {
  characters: GridCharacter[];
  /**
   * Nombre de versions par saga existantes. Sert uniquement à savoir s'il faut
   * proposer la bascule — les versions elles-mêmes sont chargées à la demande
   * (`/api/wiki/variants`), parce qu'elles pesaient 110 Ko dans la charge de
   * chaque visiteur pour une vue que peu ouvrent.
   */
  nbVariants?: number;
  facets?: CharacterFacets;
  /** Instantané de la configuration de lancement, résolu côté serveur. */
  access?: AccessSnapshot | null;
}) {
  // « fiches » = une carte par personnage (défaut) ; « versions » = une carte
  // par couple personnage × saga. Le choix est dans l'URL (`?vue=versions`)
  // pour qu'une liste de versions se partage.
  const [vue, setVue] = useState<"fiches" | "versions">("fiches");
  /**
   * État repris de l'URL (`?vue=versions&p=3`), lu au PREMIER RENDU.
   *
   * Et non dans un effet, comme c'était le cas pour `?p` : React vide les
   * effets des ENFANTS avant ceux du parent, et `Pagination` synchronise l'URL
   * dès son montage — avec `page` encore à 1, elle SUPPRIMAIT `?p` avant que
   * cette grille ait pu le lire. Un lien partagé retombait donc toujours sur la
   * page 1, malgré l'effet écrit pour l'éviter.
   *
   * On ne lit ici qu'une valeur rangée dans une ref : le rendu, lui, reste
   * identique à celui du serveur, donc aucun écart d'hydratation.
   */
  const initial = useRef<{ vue: "fiches" | "versions"; page: number } | null>(null);
  if (initial.current === null) {
    const params =
      typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
    const p = Number(params?.get("p"));
    initial.current = {
      vue: params?.get("vue") === "versions" ? "versions" : "fiches",
      page: Number.isFinite(p) && p > 1 ? Math.floor(p) : 1,
    };
  }
  // Chargées au premier passage en mode « Versions », puis gardées.
  const [variants, setVariants] = useState<GridVariant[]>([]);
  /**
   * État du chargement des versions, et NON deux booléens dérivés du contenu.
   *
   * La condition d'arrêt était « la liste n'est plus vide ». Or
   * `/api/wiki/variants` rattrape ses propres erreurs et répond `200` avec un
   * tableau VIDE (cf. la route) : sur une base indisponible, la liste restait
   * donc vide, le drapeau de chargement retombait à `false`, l'effet se
   * redéclenchait — et la page rappelait l'API en boucle, sans fin et sans
   * jamais rien afficher d'autre que « aucune version ne correspond ». Une
   * réponse vide légitime produisait exactement le même emballement.
   *
   * Avec un état explicite, la requête part une fois ; l'échec se dit et se
   * rejoue à la demande du lecteur.
   */
  const [etatVersions, setEtatVersions] = useState<"vierge" | "chargement" | "pret" | "erreur">(
    "vierge",
  );
  useEffect(() => {
    if (vue !== "versions" || etatVersions !== "vierge") return;
    setEtatVersions("chargement");
    fetch("/api/wiki/variants")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setVariants(Array.isArray(d?.variants) ? d.variants : []);
        setEtatVersions("pret");
      })
      .catch(() => setEtatVersions("erreur"));
  }, [vue, etatVersions]);
  useEffect(() => {
    if (initial.current?.vue === "versions") setVue("versions");
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (vue === "versions") url.searchParams.set("vue", "versions");
    else url.searchParams.delete("vue");
    window.history.replaceState(null, "", url.toString());
  }, [vue]);

  const [query, setQuery] = useState("");
  const [races, setRaces] = useState<string[]>([]);
  const [techniques, setTechniques] = useState<string[]>([]);
  const [arcs, setArcs] = useState<string[]>([]);
  /**
   * Ordre d'affichage. Par défaut « les mieux documentés », parce que c'est la
   * seule vue qui a du sens à l'atterrissage : l'alphabétique met Abo, Abra et
   * Adjudant Black avant Goku, et l'ordre de la base met les fiches vides
   * devant. Le tri se fait ici (client) sur une note déjà calculée côté serveur
   * — pas de nouvelle requête au changement.
   */
  const [tri, setTri] = useState<"richesse" | "alpha">("richesse");

  const techniqueOptions = facets?.techniqueOptions ?? [];
  const arcOptions = facets?.arcOptions ?? [];
  // `?? {}` fabriquait un objet NEUF à chaque rendu quand la base n'avait pas
  // répondu : les deux `useMemo` de filtrage le voyaient changer d'identité et
  // re-filtraient les 1 307 fiches à chaque frappe de touche, à chaque bascule,
  // à chaque changement de page. Le repli est mémoïsé pour rester stable.
  const vide = useMemo<Record<string, string[]>>(() => ({}), []);
  const charTechniques = facets?.charTechniques ?? vide;
  const charArcs = facets?.charArcs ?? vide;

  // Facettes races (avec compte), triées par fréquence puis alpha → options du
  // filtre. Reste dérivé des personnages (colonne `race`, pas de la jointure).
  const raceOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of characters) {
      if (!c.race) continue;
      counts.set(c.race, (counts.get(c.race) ?? 0) + 1);
    }
    return [...counts.entries()]
      .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count }));
  }, [characters]);

  // Filtrage CUMULATIF : ET entre catégories (race ET technique ET arc ET
  // recherche), OU à l'intérieur d'une catégorie.
  const filtered = useMemo(() => {
    const q = norm(query);
    const raceSet = races.length ? new Set(races) : null;
    const techSet = techniques.length ? new Set(techniques) : null;
    const arcSet = arcs.length ? new Set(arcs) : null;
    return characters.filter((c) => {
      if (raceSet && (!c.race || !raceSet.has(c.race))) return false;
      if (techSet) {
        const ct = charTechniques[String(c.id)];
        if (!ct || !ct.some((t) => techSet.has(t))) return false;
      }
      if (arcSet) {
        const ca = charArcs[String(c.id)];
        if (!ca || !ca.some((a) => arcSet.has(a))) return false;
      }
      if (!q) return true;
      return norm(c.name).includes(q) || (c.nameJa ? c.nameJa.includes(query.trim()) : false);
    });
  }, [characters, query, races, techniques, arcs, charTechniques, charArcs]);

  /**
   * Versions filtrées — mêmes règles que les fiches, appliquées au personnage
   * PARENT (race, techniques, arcs lui appartiennent), plus la saga dans la
   * recherche : taper « namek » doit remonter les versions de la saga Namek
   * autant que les Nameks.
   */
  const versionsFiltrees = useMemo(() => {
    if (vue !== "versions") return [];
    const q = norm(query);
    const raceSet = races.length ? new Set(races) : null;
    const techSet = techniques.length ? new Set(techniques) : null;
    const arcSet = arcs.length ? new Set(arcs) : null;
    return variants.filter((v) => {
      if (raceSet && (!v.race || !raceSet.has(v.race))) return false;
      if (techSet) {
        const ct = charTechniques[String(v.characterId)];
        if (!ct || !ct.some((t) => techSet.has(t))) return false;
      }
      if (arcSet) {
        const ca = charArcs[String(v.characterId)];
        if (!ca || !ca.some((a) => arcSet.has(a))) return false;
      }
      if (!q) return true;
      return norm(v.name).includes(q) || norm(v.saga).includes(q);
    });
  }, [variants, vue, query, races, techniques, arcs, charTechniques, charArcs]);

  /** Fiches filtrées PUIS classées. */
  const fichesTriees = useMemo(
    () =>
      tri === "alpha"
        ? [...filtered].toSorted((a, b) => a.name.localeCompare(b.name, "fr"))
        : [...filtered].toSorted(comparerRichesse),
    [filtered, tri],
  );

  /**
   * Versions classées par la richesse de leur personnage PARENT, puis par saga.
   * Une version ne porte pas de note propre : elle n'a ni article ni rubriques,
   * seulement ce qui change d'une saga à l'autre. La classer par son parent
   * remonte les versions de Goku avant celles d'un figurant, ce qui est bien la
   * question posée.
   */
  const versionsTriees = useMemo(() => {
    if (vue !== "versions") return versionsFiltrees;
    const note = new Map(characters.map((c) => [c.id, c.richesse ?? 0]));
    return [...versionsFiltrees].toSorted((a, b) => {
      if (tri === "alpha") return a.name.localeCompare(b.name, "fr");
      const d = (note.get(b.characterId) ?? 0) - (note.get(a.characterId) ?? 0);
      return d !== 0 ? d : a.name.localeCompare(b.name, "fr");
    });
  }, [versionsFiltrees, characters, tri, vue]);

  /** Liste réellement paginée et rendue, selon la vue choisie. */
  const liste = vue === "versions" ? versionsTriees : fichesTriees;

  // Pagination bornée : 48 cartes à l'écran (multiple élégant de 2, 3, 4, 6, 8 pour
  // remplir parfaitement toutes les grilles sans saut de ligne incomplet).
  const PAGE = 48;
  const [page, setPage] = useState(1);
  // Page reprise de l'URL (cf. `initial`), appliquée une fois montée.
  useEffect(() => {
    const p = initial.current?.page ?? 1;
    if (p > 1) setPage(p);
  }, []);
  /**
   * Tout changement de filtre ramène à la première page : rester en page 7
   * d'une liste qui vient d'en perdre 6 affiche un vide inexplicable.
   *
   * Deux précautions, pour ne pas défaire la restauration de `?p` :
   *  - on compare les filtres au lieu de se fier au déclenchement de l'effet,
   *    qui s'exécute aussi au montage (et deux fois en mode strict) ;
   *  - tant que `vue` n'a pas rejoint la valeur lue dans l'URL, on est encore
   *    dans la mise en place de l'état initial, pas devant un choix du lecteur
   *    — sans quoi `?vue=versions&p=3` perdait sa page au montage.
   */
  const filtresPrecedents = useRef<string | null>(null);
  const restauration = useRef((initial.current?.page ?? 1) > 1);
  useEffect(() => {
    const cle = JSON.stringify([query, races, techniques, arcs, vue, tri]);
    if (filtresPrecedents.current === cle) return;
    const premier = filtresPrecedents.current === null;
    filtresPrecedents.current = cle;
    if (restauration.current) {
      if (vue === initial.current?.vue) restauration.current = false;
      return;
    }
    if (!premier) setPage(1);
  }, [query, races, techniques, arcs, vue, tri]);
  const pages = Math.max(1, Math.ceil(liste.length / PAGE));
  const pageSure = Math.min(page, pages);
  const visible = useMemo(
    () => fichesTriees.slice((pageSure - 1) * PAGE, pageSure * PAGE),
    [fichesTriees, pageSure],
  );
  const versionsVisibles = useMemo(
    () => versionsTriees.slice((pageSure - 1) * PAGE, pageSure * PAGE),
    [versionsTriees, pageSure],
  );

  const activeCount = races.length + techniques.length + arcs.length;
  const resetFilters = () => {
    setRaces([]);
    setTechniques([]);
    setArcs([]);
  };
  const unite = vue === "versions" ? "versions" : "personnages";

  return (
    <WikiListLayout
      search={
        <WikiSearchField
          value={query}
          onChange={setQuery}
          label="Rechercher un personnage"
          placeholder={vue === "versions" ? "Personnage ou saga…" : "Rechercher un personnage…"}
        />
      }
      filters={
        <>
          <WikiFacet title="Race" options={raceOptions} selected={races} onChange={setRaces} />
          <WikiFacet
            title="Techniques"
            options={techniqueOptions}
            selected={techniques}
            onChange={setTechniques}
          />
          <WikiFacet title="Arcs" options={arcOptions} selected={arcs} onChange={setArcs} />
        </>
      }
      activeCount={activeCount}
      onReset={resetFilters}
      tools={
        <>
          {/* Deux ordres seulement : « ce que le wiki connaît le mieux » et « je
					    cherche un nom précis ». Trier par race ou par ki ferait doublon
					    avec les filtres, qui répondent déjà mieux. */}
          <WikiSegmented
            label="Trier les personnages"
            value={tri}
            onChange={setTri}
            options={[
              ["richesse", "Les mieux documentés"],
              ["alpha", "A → Z"],
            ]}
          />
          {nbVariants > 0 && (
            <WikiSegmented
              label="Affichage"
              value={vue}
              onChange={setVue}
              options={[
                ["fiches", "Fiches"],
                ["versions", "Versions"],
              ]}
            />
          )}
        </>
      }
      resultCount={vue === "versions" ? versionsFiltrees.length : filtered.length}
      resultLabel={
        vue === "versions"
          ? `${versionsFiltrees.length} / ${nbVariants} versions`
          : `${filtered.length} / ${characters.length} personnages`
      }
    >
      {vue === "versions" && (etatVersions === "vierge" || etatVersions === "chargement") ? (
        <p className="py-20 text-center text-sm text-white/55">Chargement des versions…</p>
      ) : vue === "versions" && etatVersions === "erreur" ? (
        // Un échec réseau ne doit pas se déguiser en « aucun résultat » : le
        // lecteur croirait la rubrique vide et n'aurait aucun moyen de réessayer.
        <div className="py-20 text-center">
          <p className="text-sm text-white/60">Les versions n&apos;ont pas pu être chargées.</p>
          <button
            type="button"
            onClick={() => setEtatVersions("vierge")}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-dbz-orange/60 bg-dbz-orange/10 px-5 font-display text-[13px] font-semibold text-dbz-orange transition-colors hover:bg-dbz-orange hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
          >
            Réessayer
          </button>
        </div>
      ) : liste.length === 0 ? (
        <p className="py-20 text-center text-white/60">
          {vue === "versions" ? "Aucune version ne correspond" : "Aucun personnage ne correspond"}{" "}
          {query ? `à « ${query} »` : "à ces filtres"}.
        </p>
      ) : vue === "versions" ? (
        <CharacterCardGrid dense>
          {versionsVisibles.map((v, index) => (
            <CharacterPosterCard
              key={v.id}
              // La version renvoie vers la fiche du personnage, à l'ancre de sa
              // saga : c'est là que vivent son résumé, ses faits marquants et
              // ses preuves. Une page par version dupliquerait la fiche pour
              // n'en changer que quelques champs.
              href={`/wiki/personnages/${v.characterId}#saga-${v.sagaId}`}
              name={v.name}
              subtitle={v.saga}
              meta={v.form}
              image={v.image ?? v.characterImage}
              width="full"
              loading={index < 12 ? "eager" : "lazy"}
              access={access}
            />
          ))}
        </CharacterCardGrid>
      ) : (
        <CharacterCardGrid dense>
          {visible.map((c, index) => (
            <CharacterPosterCard
              key={c.id}
              href={`/wiki/personnages/${c.slug ?? c.id}`}
              name={c.name}
              race={c.race}
              image={c.image}
              fallback={c.portraitXv2}
              width="full"
              loading={index < 12 ? "eager" : "lazy"}
              access={access}
              // Morph d'élément partagé : la vignette et l'image de la fiche
              // partagent `character-img-${id}`, la grille « se déplie » au clic.
              morphId={c.id}
            />
          ))}
        </CharacterCardGrid>
      )}

      <Pagination
        page={pageSure}
        parPage={PAGE}
        total={liste.length}
        onPageChange={setPage}
        unite={unite}
        className="pt-6"
      />
    </WikiListLayout>
  );
}
