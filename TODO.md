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
- [ ] Qualifier les changements préparés des writers média, snapshots JSON et versions VF/VOSTFR/VOST ; diagnostics TypeScript natifs site et DB verts, suites Bun non exécutées.
- [ ] Rendre disponible Bun stable 1.4.4 sur Windows et VPS, puis exécuter installation figée et gates exigées par GOAL.md.
- [ ] Qualifier l'accès éditorial et les writers des éditions/langues/sous-titres ; enrichir et relire les fiches, révisions, réplica et index. Conserver le gel OCR/traduction databooks.
- [ ] Livrer via la fabrique VPS et Infra DBFR, puis contrôler le catalogue et la chronologie publics.
