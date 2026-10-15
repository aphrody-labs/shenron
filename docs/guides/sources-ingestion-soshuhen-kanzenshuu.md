# Pipeline d'Ingestion : Archives Sōshūhen (Jump Digest) & Guides Kanzenshuu

Ce document technique formalise les protocoles d'ingestion, d'alignement et d'indexation RAG pour deux sources documentaires fondamentales de l'écosystème Dragon Ball :

1. **L'édition Sōshūhen (総集編 - Weekly Shōnen Jump Digest Edition)**
2. **Les archives et guides de référence Kanzenshuu**

> **État vérifié le 7 octobre 2026 : préparation, pas ingestion.** Les 18 fiches
> Sōshūhen de production (`/api/manga/volume/701` à `/718`) déclarent 381 pages
> pour le tome 1 et aucune pour les 17 suivants. Ce compte API ne prouve pas
> encore que les fichiers sont accessibles ni que leur contenu est indexé.
> Le script ci-dessous contient des métadonnées et des estimations non recoupées ;
> ses dates, plages de chapitres et nombres de pages ne constituent pas un catalogue
> éditorial validé. Par exemple, Shueisha date Legend 2 du 13 mai 2016
> ([ISBN 9784081111664](https://www.shueisha.co.jp/books/items/contents.html?isbn=978-4-08-111166-4)),
> alors que le script indique le 27 mai. Ne pas ingérer ces valeurs sans recoupement.
> Les propriétés de reproduction et les comptes de commentaires présentés ci-dessous
> restent à vérifier sur les exemplaires. La complétude exige les fichiers réels,
> leur provenance, une pagination vérifiée et les preuves de dépôt DB et RAG.

---

## 1. Édition Sōshūhen (Shueisha, 2016–2017)

### 1.1 Définition & Valeur Documentaire pour Shenron

L'édition _Dragon Ball Sōshūhen_ (18 tomes grand format B5) reproduit **à l'identique l'expérience de lecture originale dans le Weekly Shōnen Jump** (1984–1995) :

- **Pages couleur d'origine** : Préservation intégrale des chapitres en quadrichromie (4 couleurs) et bichromie (2 couleurs / rouge-noir), tronquées ou converties en noir et blanc dans les tankōbon standards.
- **Titres et bandeaux de prépublication** : Typographies manuscrites originales des titres de chapitres, accroches de début de chapitre et aperçus du numéro suivant (_Next Issue Teasers_).
- **Commentaires hebdomadaires d'Akira Toriyama** : Restitution des 519 encarts d'auteur hebdomadaires de la table des matières du _Jump_ contemporains de la rédaction.
- **Double-pages intégrales non rognées** : Conservation des bords de coupe originaux perdus lors de la reliure des volumes reliés.

### 1.2 Schéma d'Ingestion PostgreSQL (`shenron_site`)

Chaque tome de la collection Sōshūhen est rattaché à `bot.db_media_publications` et enrichit les métadonnées de chapitres `bot.db_manga_chapters` :

```typescript
interface SoshuhenVolumeRecord {
  volumeNumber: number; // 1 à 18
  titleJa: string; // Ex: "DRAGON BALL 総集編 超悟空伝 Legend 1"
  subtitleFr: string; // Ex: "Sōshūhen Légende 1 : Enfantillage & Quête"
  chaptersRange: [number, number]; // [1, 24]
  publishedAt: string; // 2016-05-13
  rawJumpColorPagesCount: number;
  originalToriyamaCommentsCount: number;
  coverAssetPath: string; // "/images/manga/soshuhen/legend-01.webp"
}

interface SoshuhenChapterMetadata {
  chapterNumber: number; // 1 à 519
  jumpIssue: string; // Ex: "Weekly Shōnen Jump 1984 #51"
  jumpReleaseDate: string; // 1984-11-20
  hasColorPages: boolean;
  colorType: "4_colors" | "2_colors" | "monochrome";
  originalTitleHeader: string; // Calligraphie Jump
  toriyamaWeeklyComment: {
    ja: string;
    fr: string;
    source: "Weekly Shōnen Jump TOC / Sōshūhen";
  };
}
```

---

## 2. Guides Documentaires Kanzenshuu

### 2.1 Périmètre & Doctrine d'Autorité

Kanzenshuu (fusion de Daizenshuu EX et Kanzentai) constitue la référence internationale occidentale pour :

- **L'analyse des animateurs & superviseurs d'épisodes Toei** : Attribution plan par plan des séquences cultes aux directeurs d'animation (Minoru Maeda, Masaki Sato, Katsuyoshi Nakatsuru, Tadayoshi Yamamuro, Keisuke Masunaga).
- **Les traductions critiques d'interviews japonaises** : Vérification bilingue japonais/anglais des entretiens parus dans les _Daizenshuu_, _Chōzenshū_, _Shenlong Times_ et brochures de cinéma.
- **Le Rumor Guide** : Réfutation méthodique des légendes urbaines et faux canons de fans (Super Saiyan 5, implication de Toriyama sur AF, fausses citations).

### 2.2 Règles Strictes d'Ingestion RAG & Wiki

1. **Recoupement Obligatoire** : Toute citation issue de Kanzenshuu doit conserver sa référence à l'imprimé japonais d'origine (_Source imprimée première_).
2. **Pas d'import de fan-théories** : Seules les données factuelles (numéros de publication, crédits de générique vérifiés, dates de diffusion) sont éligibles à l'ingestion dans `public.canon_references` et `bot.db_contributors`.
3. **Attribution Claire** : Métadonnées stockées avec `source_id = 'kanzenshuu_archive'` et mention du traducteur / archiviste d'origine.

---

## 3. Script Opérationnel Préparatoire

Le script `scripts/ops/prepare-soshuhen-kanzenshuu-ingest.ts` permet de :

1. Afficher un manifeste préparatoire de 18 tomes et ses estimations.
2. Compter les lignes de `bot.db_manga_chapters`, toutes éditions confondues.
3. Afficher des pistes documentaires Kanzenshuu.

Il ne vérifie aucun fichier de page, aucun doublon d'interview et aucun dépôt RAG.
Il n'écrit pas en base ; `--apply` est refusé pour éviter de confondre préparation
et ingestion. Le succès de son exécution ne vaut pas validation de production.

### Commande d'Exécution :

```bash
bun scripts/ops/prepare-soshuhen-kanzenshuu-ingest.ts --dry-run
```

## 4. Contrôles de couverture et dépôt des nouvelles sources

Le contrôle des sources distingue cinq familles : Sōshūhen, Kai Dragon Book,
Full Color, Weekly Shōnen Jump et interviews. Un ISBN et un nombre de pages
bibliographiques ne prouvent pas que les images ont été acquises. Papier et
numérique, langue et identifiant d'édition restent distincts.

```sh
# Catalogue énuméré, manifestes de pages et fichiers locaux : sortie 2 si incomplet.
bun packages/pipeline/scripts/source-coverage.ts --audit <catalog.json> <manifest-root> <asset-root> <report.json>

# Bibliographie et résolution PostgreSQL en lecture seule.
bun packages/pipeline/scripts/source-ingestion-postgres.ts --bibliography-audit <bibliography.json> <report.json>

# Accès aux images du lecteur : sortie 1 tant que l'exhaustivité DB/RAG est non prouvée.
bun scripts/audit/source-readiness.ts https://dragonballfr.com var/reports/source-readiness-all-assets.json --all-assets
```

Les rapports générés restent dans `var/reports/`. L'audit de couverture exige une
énumération revue des ouvrages et des pages, des fichiers vérifiés par SHA-256,
une provenance et des transcriptions revues ou une déclaration explicite d'absence
de texte. Une famille dont l'univers attendu reste inconnu est incomplète.

L'adaptateur de dépôt réutilise PostgreSQL, les révisions éditoriales et la
synchronisation RAG d'Aphrody. Le gel des databooks reste impératif. Le mapping
entre pagination d'édition et chapitres du lecteur doit être vérifié avant de
déposer un volume manga. Les simulations et les tests locaux ne constituent ni
une ingestion exécutée ni une qualification de production.

## 5. Rattacher les scans Sōshūhen acquis au lecteur

Le writer `scripts/ops/import-sosh-readers.ts` ajoute les chapitres manquants sans
modifier les chapitres existants. Le schéma strict du manifeste est dans
`packages/pipeline/src/dragon-ball/sosh-reader-manifest.ts` ; les fixtures du writer
montrent son format complet. Un lot peut contenir un seul tome. Le manifeste privé
énumère chaque image réellement acquise, son numéro de scan, son URL publique
`/assets/` et son SHA-256, ainsi que la provenance, une preuve du nombre de pages,
les titres japonais et éditorial relus, et la référence privée des droits. Un
nombre bibliographique ou une couverture ne suffit pas à déclarer le tome acquis.

Dans un dossier privé absolu de mode `0700`, déposer `manifest.json`, puis exécuter
sur la cible qualifiée, via le contrôleur Infra et l'environnement PostgreSQL
protégé existant :

```sh
bun scripts/ops/import-sosh-readers.ts --job /chemin/prive/sosh-lot --expected-sha <sha256-manifest>
```

Le mode par défaut lit les octets de chaque image et produit `before.json` et
`apply-plan.json` ; aucune écriture PostgreSQL. Les URL sont sans redirection et
restent limitées aux hôtes média propriétaires. Conserver les pages du tome 1
existantes ; ne pas les reconstituer avec les autres éditions.

Avant `--apply`, l'Infra produit un vrai dump PostgreSQL `catalog-before.dump`
couvrant `bot.db_manga_volumes`, `bot.db_manga_chapters` et
`public.wiki_revisions`, puis vérifie son inventaire. Le reçu privé `backup.json`
porte `{"inventoryVerified":true,"sha256":"<sha256-dump>"}`. Utiliser le propriétaire
de sauvegarde qualifié de la cible ; ne pas mettre `DATABASE_URL` ni un mot de
passe dans les arguments d'une commande. Le writer vérifie les octets du dump et
refuse un snapshot modifié. L'application verrouille brièvement les deux tables
manga, ajoute chaque chapitre et sa révision dans une transaction, puis relit les
lignes depuis une nouvelle requête. Une deuxième application du même lot doit
renvoyer `replay:true` sans chapitre ni révision supplémentaire.

```sh
bun scripts/ops/import-sosh-readers.ts --job /chemin/prive/sosh-lot --expected-sha <sha256-manifest> --apply
```

La preuve SQL ne suffit pas à qualifier le lecteur : relire ensuite les API de
volume et chapitre, les images effectivement rendues et le catalogue publié.
L'invalidation des caches et une éventuelle nouvelle projection CDN passent par
leurs propriétaires existants. L'import n'ajoute ni transcription OCR ni vecteur
RAG ; ces étapes utilisent ensuite le manifeste de sources et le writer de la
section 4.

Qualification du 15 octobre 2026 : cinq tests unitaires et une fixture PostgreSQL
18.1 isolée vérifient les tableaux JSON, les révisions, le refus d'un état modifié,
le replay et le rollback quand l'historique refuse l'écriture. Aucun de ces tests
ne constitue une application aux données de production.
