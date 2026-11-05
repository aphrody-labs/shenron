# Architecture : pages œuvre DBFR (d'après `recon.md`, 2026-10-17)

Rédigé le 2026-11-05 avec `/replica-architect`. Sources : `replica/recon.md` (12 écrans, 5 parcours, 9 entités), `replica/features.csv` (28 fonctionnalités), le schéma Drizzle existant d'`apps/site` et l'ADR 0003 de yolo-stack.

Objet : ajouter à dragonballfr.com des pages œuvre génériques (série, film, jeu) sur le modèle des sites officiels : ancres, vidéos, personnages, diffusion, staff, actus. On reprend le modèle d'information, pas l'identité : aucun visuel, aucun texte, aucune police ni couleur de marque des éditeurs (recon §7 et §9). Le lecteur de chapitres existe déjà et reste tel quel.

## 1. Stack

La stack est celle du site et de l'ADR 0003. Rien de nouveau n'est introduit sans raison.

| Couche | Choix | Pourquoi |
| --- | --- | --- |
| Site | Leptos 0.8 SSR statique sur Axum (`yolo-stack/apps/shenron/crates/shenron-site`) | Décision ADR 0003. Le SSR statique sert le SEO des pages œuvre. |
| Transition | `apps/site` Next 16.5 reste en production jusqu'à la bascule | `yolo-next migrate --target leptos` donne 91 % de parité (`yolo-stack/docs/research/notes/shenron-site-next-migration-report.md`). |
| Style | Jetons `replica/design/tokens.json` (14 paires AA validées), sans CSS manuel côté Leptos | Les jetons existent déjà et passent le contrôle de contraste. |
| Base | Postgres existant (`DATABASE_URL`), une seule base | Les tables `ba_*`, `site_*` et catalogue y vivent déjà. |
| Accès | `sqlx` côté Rust, Drizzle côté Next pendant la transition, même schéma | Un seul schéma, migrations SQL versionnées. |
| Auth | Better Auth existant (`ba_user`, `ba_session`, passkey, OAuth) | Les pages œuvre sont publiques ; seule l'administration exige un rôle. |
| Fichiers | R2 derrière `cdn.dragonballfr.com` | Déjà la source des planches et des médias autorisés. |
| E-mail | Fournisseur transactionnel à confirmer (aucun SDK mail dans `apps/site/package.json`) | Indispensable pour le double opt-in de la newsletter. |
| Tâches | Timer systemd ou cron sur l'hôte prod, journalisé | Une seule tâche (fraîcheur de la diffusion), pas de file de jobs à introduire. |

## 2. Schéma

Fichier : `replica/schema.sql`. Il prévoit 8 tables neuves, sans toucher aux tables existantes.

| Table | Rôle | Propriétaire |
| --- | --- | --- |
| `works` | œuvre (anime, film, jeu, manga), slug, statut de publication | éditorial (rôle admin) |
| `work_texts` | titre, intro, histoire par langue (fr, en, ja) | éditorial |
| `work_videos` | médias autorisés (CDN propre ou embed officiel) avec date et type | éditorial |
| `characters` | fiche personnage par œuvre, portrait propre ou absent | éditorial |
| `broadcast_slots` | diffusion par région, plateforme, jour et heure (fuseau explicite) | éditorial |
| `staff_credits` | crédits ordonnés | éditorial |
| `work_news` | liens d'actualité datés | éditorial |
| `newsletter_signups` | e-mail, langue, consentement daté, double opt-in | l'inscrit (effacement RGPD) |

Règles appliquées :
- clés `uuid` et `created_at` / `updated_at` en `timestamptz` ;
- règles `on delete` choisies une par une ;
- index sur chaque clé étrangère et chaque tri ;
- statuts en `check` ;
- unicité métier : un slug par œuvre, un texte par langue, un créneau par (œuvre, région, plateforme, jour).

Contrôle d'accès : une vérification d'autorisation par requête dans la couche de données. Lecture publique limitée aux œuvres `published` ; écriture réservée au rôle admin de Better Auth. La RLS Postgres n'est pas utilisée, car le site se connecte avec un seul rôle applicatif ; une RLS sur ce rôle n'isolerait rien.

`ChapterPage` (recon §6) n'est pas recréé : les planches sont servies par le CDN et le lecteur existant.

Les données du jeu S08/S09 (plateformes, wishlist) restent hors périmètre : la recon §7 exclut boutiques et wishlist tierces.

## 3. Routes

| Méthode et chemin | Rôle | Qui | Entrée | Sortie | Parcours |
| --- | --- | --- | --- | --- | --- |
| GET `/:lang/oeuvres` | liste des œuvres publiées | public | `lang` | HTML statique | F01 |
| GET `/:lang/oeuvres/:slug` | page œuvre à ancres (hero, vidéos, personnages, diffusion, staff, actus) | public | `lang`, `slug` | HTML statique, `SsrMode::Static` + `prerender_params` | F01, F02 |
| GET `/:lang/oeuvres/:slug#personnages` et les autres ancres | navigation interne | public | – | – | F01 |
| GET `/:lang/oeuvres/:slug/declarations` | déclarations de l'auteur liées (`toriyama-interviews` existant) | public | `slug` | HTML | F03 |
| POST `/api/newsletter` | inscription, envoi du lien de confirmation | public, limité en débit | e-mail, langue, consentement | 202 | F04 |
| GET `/api/newsletter/confirm/:token` | confirme l'inscription (jeton à usage unique) | public | jeton | redirection 303 | F04 |
| POST `/api/newsletter/unsubscribe/:token` | désinscription et effacement | public | jeton | 200 | F04 |
| POST/PATCH/DELETE `/api/admin/works…` | édition des œuvres et des tables liées | admin | JSON validé | 200/201/204 | éditorial |
| GET `/sitemap.xml`, `/robots.txt` | entrées des pages œuvre publiées | public | – | XML / texte | SEO |

Le changement de langue (F02) reste le `LanguageSwitcher` existant, avec les liens `hreflang` entre `/fr`, `/en` et `/ja`.

Webhooks entrants : aucun. Webhook sortant : aucun.

Tâches :
- `broadcast-staleness`, quotidienne à 06:00 UTC : marque les créneaux sans vérification depuis 30 jours ;
- `newsletter-purge`, quotidienne : supprime les inscriptions non confirmées après 7 jours.

Sources : uniquement les API publiques officielles avec les clés du propriétaire. Aucun endpoint privé des sites éditeurs.

## 4. Points délicats

- **Fuseaux et heure d'été** : un créneau stocke le jour, l'heure locale et le fuseau IANA (`Asia/Tokyo`), jamais un instant UTC figé. L'heure affichée est calculée à la lecture, sinon elle glisse d'une heure deux fois par an.
- **Idempotence** : l'inscription à la newsletter est un upsert sur l'e-mail normalisé, et la confirmation ne s'applique qu'une fois (jeton haché, `confirmed_at` déjà renseigné, sans effet).
- **Course** : deux confirmations simultanées sont sans effet grâce à `update … where confirmed_at is null`.
- **Limites de débit** : la limite par IP sur `/api/newsletter` reprend le limiteur existant d'`apps/site` s'il y en a un, à vérifier ; sinon un compteur en mémoire par instance.
- **Médias tiers** : un embed officiel peut disparaître. La page garde un repli (titre, date, lien) et ne casse pas la mise en page (ratio réservé).
- **Recherche** : les œuvres entrent dans l'index RAG et wiki existant. Aucun moteur de plus.
- **Délivrabilité** : SPF, DKIM et DMARC sur le domaine d'envoi. Ce sont des changements DNS, donc une action du propriétaire.
- **RGPD** : consentement daté et versionné, désinscription en un clic qui supprime la ligne, aucune date de naissance collectée (le formulaire Bandai S09 la demande, pas nous).
- **Multilingue** : un `work_texts` par langue. Une langue absente renvoie vers la langue par défaut avec `hreflang`, sans traduction automatique publiée.
- **Carrousels** : contrôles visibles, pause, arrêt au focus et en `prefers-reduced-motion`.

## 5. Ordre de construction

1. **Tranche verticale** : une œuvre (Dragon Ball Daima) de bout en bout. Migration des tables `works` et `work_texts`, puis `GET /:lang/oeuvres/:slug` avec hero et intro, prérendu, présent dans le sitemap. Écrans S04 et S01. Elle prouve la chaîne Leptos, la base et le prérendu.
2. **Indispensables** (`features.csv`, priorité must) : ancres et menu modal (S05), vidéos (`work_videos`), personnages (`characters`), diffusion par région (`broadcast_slots`, avec la tâche de fraîcheur), sélecteur de langue.
3. **Souhaitables** : staff (`staff_credits`), actus (`work_news`), déclarations de l'auteur (S06), carrousel du hero.
4. **Optionnelles** : newsletter avec double opt-in (`newsletter_signups`, S09, après choix du fournisseur mail), partage.
5. **Corrections** de `/replica-entrepreneur` une fois qu'il aura tourné.

## Résumé

- **Stack** : Leptos 0.8 SSR sur Axum, Postgres existant, Better Auth existant, R2/CDN.
- **Volume** : 8 tables, 9 entrées de routes (dont une regroupant les écritures admin et une les ancres), 2 tâches.
- **Trois risques** :
  - la fraîcheur de la diffusion par région ;
  - les fuseaux et l'heure d'été ;
  - le RGPD et la délivrabilité de la newsletter, qui attend le choix du fournisseur et le DNS.
- **Suite** : `/replica-design`, déjà fait (`replica/design/`), puis `/replica-build` sur la tranche verticale.
