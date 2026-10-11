# Objectif Shenron — interface unique et serveur Bun

- [ ] Aligner le dashboard admin sur les contrats bot, les sondes réelles et le stockage A2A configuré ; qualifier en navigateur puis livrer en production.
- [ ] Qualifier les bibliothèques FFI de production et les plans natifs RAG/crawl/LLM/entraînement/Docker ; installer les features et les accès Infra manquants sur leurs hôtes avant activation.
- [ ] Activer et qualifier la file Web distribuée du dashboard, les workers de crawl/scrape/index, puis les étapes Infra SQL, Redis et serving CDN avec reçus réels.

- [x] Porter la limite de débit d'authentification sur l'hôte Bun et fermer ses connexions à l'arrêt.
- [x] [Partager la purge DB du compte et la brancher sur l'hôte Bun](docs/operations/bun-account-deletion.md).
- [x] [Rétablir la validation des mises à jour de profil sur Bun](docs/operations/bun-profile-validation.md).
- [x] Synchroniser le profil métier et préserver les droits admin sur Bun, avec qualification PostgreSQL isolée.
- [x] [Lire le profil de lecteur sur Bun sans résolution DB ni cache Next en mode hôte](docs/operations/bun-session-profile.md).
- [ ] Qualifier OAuth Discord réel ; transférer les identités d’automatisation et retirer le mode auth/DB local restant dans Next.
- [ ] Rendre la reprise de purge durable en cas d'arrêt après la suppression Better Auth.
- [ ] Sortir les fonctions backend restantes de Next et qualifier les accès DB sur Bun.
- [ ] Auditer les pertes de fonctionnalités entre les grands commits UI et restaurer celles confirmées.
- [x] [Rétablir la fermeture de la navigation mobile sur page courante et passage au bureau](docs/products/shell-navigation.md).
- [x] [Partager les scènes d’accueil et corriger les préférences, pauses et erreurs de vidéo](docs/products/home-media.md).
- [ ] Réconcilier la livraison et le routage Infra du site public avant qualification visuelle en production.
- [x] [Corriger les gestes interrompus et les faux doubles taps du lecteur partagé](docs/products/reader-gestures.md).
- [x] [Restituer le plein écran natif du lecteur après une réponse IPC tardive](docs/products/reader-fullscreen.md).
- [x] [Partager Dragon Radar, rétablir ses dix familles et borner ses chargements avec reprise](docs/products/dragon-radar.md).
- [ ] Unifier le rendu manga web, bureau et mobile ; vérifier visuellement les états et tailles d'écran.
- [ ] Qualifier les chargements, erreurs, accessibilité et livraison de bout en bout.

## GOAL.md — catalogue Dragon Ball (11 octobre 2026)

- [x] Inventorier PostgreSQL en lecture : 11 lots, identifiants, sources et rapprochement ISBN des 18 Sōshūhen ; rapports privés dans `var/reports/catalog-expansion/`.
- [x] Vérifier les contrats admin et les dépendances runtime/gel ; préparer les corrections bibliographiques sourcées sans mutation.
- [x] Étendre la collecte privée : 82 notices de mangas dérivés et 48 épisodes SDBH identifiés par leurs sources primaires ; conserver les correspondances et lacunes.
- [x] Qualifier et pousser les writers média, snapshots JSON et versions VF/VOSTFR/VOST (`f034c7e3`) ; gates Linux complètes vertes, garde native complétée dans `9fb19e97`.
- [x] Installer les dépendances figées et qualifier des binaires Bun 1.4.4 isolés : Windows debug, Linux canary. Les manifestes de runtime restent dans les rapports privés ; aucune attente d'une release GitHub stable.
- [x] Corriger trois ISBN Kanzenban par API admin, relire révisions/PG/public et synchroniser le réplica par son script propriétaire. Réparer la séquence identity databooks via Infra, sans changement des lignes.
- [ ] Terminer la qualification Windows : DLL RE qualifiée (29 tests), fixtures corrigées et poussées ; deux benchmarks debug restent rouges. Les performances Linux passent ; seuils inchangés.
- [ ] Enrichir les autres lots dédupliqués et relire fiches, révisions, réplica et index ; gel levé sur instruction explicite, configuration et activation Infra vérifiées. Artbook Dragon Quest créé (#486), exposition ISBN à compléter.
- [x] Livrer la release `9fb19e97` via fabrique VPS et Infra DBFR : six services sains, chat réel et API catalogues en200 ; rollback restauré et qualifié.
- [ ] Livrer le lot suivant (alias SQL, ISBN et extensions catalogue), puis qualifier les lecteurs et les réponses HTML aux slugs absents.

## Extension autorisée — SQL et Cloudflare (11 octobre 2026)

- [x] Inventorier les 127 tables, clés et relations ; identifier les alias d'éditions déjà masquées et les familles complémentaires.
- [x] Appliquer quatre alias canoniques d'éditions via Infra : sauvegarde/restauration et replay checksum qualifiés, 8 éditions/84 volumes inchangés ; source poussée (`ad7387dc`).
- [x] Installer Wrangler 4.149.0 sur DBFR via Bun 1.4.4 et vérifier cloudflared 2026.10.0 ; créer/configurer le tunnel `shenron-dbfr`, credential protégé.
- [x] Activer tunnel/audit via Infra et authentifier la CLI avec le credential existant protégé ; tunnel sain, API account/R2/Worker/tunnel vérifiées.
- [x] Qualifier S3 local Windows et DBFR : credentials temporaires limités à Shenron, DPAPI local, renouvellement automatique local et timer Infra ; GET S3 checksum vérifié.
- [x] Finaliser et pousser la CLI reproductible de transfert/reprise et son installation (`b9bd4a56`).
- [x] Copier le CDN initial vers R2 : 87149 corps vérifiés, zéro échec ; delta9fb273 vérifié, 110280 routes/87418 corps couverts. Delta6249 vérifié :110296routes/87431corps, zéro non vérifié ; Worker en lecture seule.
- [ ] Qualifier DNSSEC/délégation, désactiver l'import du Worker puis basculer le CDN et contrôler HTTPS, ranges, cache et rollback. Zone Cloudflare encore `pending` au dernier contrôle.
