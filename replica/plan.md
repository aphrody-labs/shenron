# Plan de Mise en Œuvre : Pages Œuvre Canoniques Dragon Ball (Anime, Films, Jeux, Manga)

Rédigé d'après `replica/recon.md`, `replica/features.csv`, `replica/architecture.md` et `replica/schema.sql`.

---

## 1. Objectifs & Périmètre

Créer pour `dragonballfr.com` les pages d'œuvres exhaustives (séries TV, films, jeux vidéo canoniques et mangas) inspirées des portails officiels japonais, en appliquant une stricte approche clean-room :

1. **Modèle d'Information Riche** : Fiches avec ancres dynamiques (`#synopsis`, `#videos`, `#personnages`, `#diffusion`, `#staff`, `#actualites`).
2. **Liaison Profonde avec le Patrimoine** : Raccordement direct avec les déclarations officielles d'Akira Toriyama (`toriyama-interviews`) et les notices du Daizenshuu.
3. **Transition Leptos SSR / Next.js 16** : Rendu statique optimisé pour le référencement international (SEO multilingue `fr`, `en`, `ja` avec balises `hreflang`).
4. **Newsletter Éditoriale Dédiée** : Inscription avec double opt-in et respect absolu du RGPD.

---

## 2. Stack Technique Retenue

| Couche                    | Technologie                                           | Justification                                                                                                 |
| :------------------------ | :---------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| **Rendu & SSR**           | Next.js 16.5 App Router (migrant vers Leptos 0.8 SSR) | Pré-génération statique (`generateStaticParams`) de toutes les fiches d'œuvres pour un chargement instantané. |
| **Système de Design**     | Tailwind CSS v4 + Jetons `replica/design/tokens.json` | 14 paires de couleurs AA/AAA conformes à l'identité Shenron.                                                  |
| **Base de Données**       | PostgreSQL existant (`DATABASE_URL`)                  | Schéma `replica/schema.sql` (8 tables neuves dédiées sans modifier l'existant).                               |
| **Médias & Vidéos**       | R2 CDN (`cdn.dragonballfr.com`)                       | Bandes-annonces officielles hébergées et extraits d'archives.                                                 |
| **E-mail Transactionnel** | Worker SMTP OVH                                       | Double opt-in sécurisé avec jeton cryptographique à usage unique.                                             |

---

## 3. Schéma de Données (`replica/schema.sql`)

### Tables Neuves :

- `works` : Identifiant, type d'œuvre (`anime_series`, `anime_film`, `manga`, `game`), slug unique, date de sortie originale, statut.
- `work_texts` : Textes bilingues (`fr`, `en`, `ja`) : titre, accroche, synopsis narratif.
- `work_videos` : Bandes-annonces et vidéos officielles avec type de flux (HLS propre ou embed autorisé).
- `characters` : Fiches personnages associées à l'œuvre avec description et rôle.
- `broadcast_slots` : Grille de diffusion par région, chaîne/plateforme, jour et fuseau horaire.
- `staff_credits` : Équipe de production ordonnée (Auteur original, Réalisateur, Chara-design, Musique).
- `work_news` : Actualités et annonces officielles liées.
- `newsletter_signups` : Adresse e-mail, langue, date de consentement, token de validation unique.

---

## 4. Matrice des Écrans & Routes

| ID      | Route                               | Rôle & Contenu                                                                                  |
| :------ | :---------------------------------- | :---------------------------------------------------------------------------------------------- |
| **S01** | `/:lang/oeuvres`                    | Répertoire chronologique de toutes les œuvres de la saga Dragon Ball.                           |
| **S02** | `/:lang/oeuvres/:slug`              | Fiche complète avec navigation par ancres (Hero, Vidéos, Personnages, Diffusion, Staff, Actus). |
| **S03** | `/:lang/oeuvres/:slug/declarations` | Liens contextuels vers les interviews et déclarations de Toriyama relatives à l'œuvre.          |
| **S04** | `/:lang/newsletter/confirm/:token`  | Validation du double opt-in de la newsletter et confirmation d'inscription.                     |

---

## 5. Découpage en Tranches Verticales (Build Order)

### Tranche 1 : Schéma SQL & Migrations (`replica/schema.sql`)

- Application de la migration créant les 8 tables sur la base PostgreSQL de staging.
- Vérification des index et des clés étrangères avec suppression en cascade.

### Tranche 2 : Composants de Présentation des Fiches (`apps/site/src/components/works/`)

- `WorkHeroBanner.tsx` : En-tête cinématique avec métadonnées, date de sortie, studio et badges de formats.
- `WorkAnchorNav.tsx` : Barre d'ancres sticky suivant le défilement fluide vers chaque section.
- `WorkCharacterGrid.tsx` : Galerie des personnages emblématiques de l'œuvre.
- `WorkStaffList.tsx` : Crédits de production structurés avec microdonnées Schema.org (`Movie`, `TVEpisode`).

### Tranche 3 : Page Index & Fiches Individuelles

- Route `apps/site/src/app/[lang]/oeuvres/page.tsx` avec tri par ordre chronologique canonique ou date de sortie.
- Route `apps/site/src/app/[lang]/oeuvres/[slug]/page.tsx` avec pré-génération statique des paramètres.

### Tranche 4 : Module Newsletter & Double Opt-in

- Formulaire d'inscription simple et direct avec case de consentement explicite.
- Génération du jeton HMAC SHA-256 et envoi de l'e-mail de confirmation.
- Route de confirmation et page de désinscription immédiate conforme RGPD.

---

## 6. Les Points de Vigilance (The Parts that Bite)

1. **Intégrité Canonique & Droits** : Aucune image sous copyright direct ne doit être hébergée sans transformation ou licence autorisée. Les portraits de personnages utilisent les rendus vectoriels propres du monorepo (`@aphrody/shenron-ui/toriyama-svg`).
2. **SEO International & Hreflang** : Chaque page d'œuvre doit obligatoirement déclarer ses balises alternatives `<link rel="alternate" hreflang="fr" href="...">`, `en` et `ja`.
3. **Fuseaux Horaires de Diffusion** : Les horaires de programmation télévisée doivent être stockés avec fuseau explicite (`timestamptz` ou fuseau IANA) et convertis à la volée selon le fuseau de l'internaute.

---

## 7. Critères d'Achèvement (Definition of Done)

- [ ] L'ensemble des œuvres majeures (Dragon Ball, DBZ, DBGT, DBS, Daima) disposent d'une fiche complète.
- [ ] La navigation par ancres est fluide, accessible au clavier et testée sur mobile et desktop.
- [ ] Le double opt-in de la newsletter envoie un e-mail réel et valide le jeton sans régression.
- [ ] 0 avertissement de validation W3C et 0 erreur dans les balises de données structurées JSON-LD.
