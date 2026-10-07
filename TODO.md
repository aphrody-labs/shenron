# Objectif Shenron — interface unique et serveur Bun

- [x] Porter la limite de débit d'authentification sur l'hôte Bun et fermer ses connexions à l'arrêt.
- [x] [Partager la purge DB du compte et la brancher sur l'hôte Bun](docs/operations/bun-account-deletion.md).
- [ ] Qualifier OAuth Discord réel ; porter validation de profil et invalidation du cache hors Next.
- [ ] Rendre la reprise de purge durable en cas d'arrêt après la suppression Better Auth.
- [ ] Sortir les fonctions backend restantes de Next et qualifier les accès DB sur Bun.
- [ ] Auditer les pertes de fonctionnalités entre les grands commits UI et restaurer celles confirmées.
- [x] [Corriger les gestes interrompus et les faux doubles taps du lecteur partagé](docs/products/reader-gestures.md).
- [ ] Unifier le rendu manga web, bureau et mobile ; vérifier visuellement les états et tailles d'écran.
- [ ] Qualifier les chargements, erreurs, accessibilité et livraison de bout en bout.
