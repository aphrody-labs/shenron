# Objectif Shenron — interface unique et serveur Bun

- [x] Porter la limite de débit d'authentification sur l'hôte Bun et fermer ses connexions à l'arrêt.
- [x] [Partager la purge DB du compte et la brancher sur l'hôte Bun](docs/operations/bun-account-deletion.md).
- [x] [Rétablir la validation des mises à jour de profil sur Bun](docs/operations/bun-profile-validation.md).
- [x] Synchroniser le profil métier et préserver les droits admin sur Bun, avec qualification PostgreSQL isolée.
- [ ] Qualifier OAuth Discord réel ; retirer la résolution DB du profil et le cache restant dans Next.
- [ ] Rendre la reprise de purge durable en cas d'arrêt après la suppression Better Auth.
- [ ] Sortir les fonctions backend restantes de Next et qualifier les accès DB sur Bun.
- [ ] Auditer les pertes de fonctionnalités entre les grands commits UI et restaurer celles confirmées.
- [x] [Rétablir la fermeture de la navigation mobile sur page courante et passage au bureau](docs/products/shell-navigation.md).
- [x] [Corriger les gestes interrompus et les faux doubles taps du lecteur partagé](docs/products/reader-gestures.md).
- [ ] Unifier le rendu manga web, bureau et mobile ; vérifier visuellement les états et tailles d'écran.
- [ ] Qualifier les chargements, erreurs, accessibilité et livraison de bout en bout.
