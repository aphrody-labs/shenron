---
name: publish-source
description: "Publie une source publique dans Shenron à partir de son URL et de l’URL du site cible : crawl natif, objets R2 et catalogue public, sans reconstruire ni redéployer Next."
---

# Publier une source

Recevoir l’URL source et l’URL du site Shenron cible. Résoudre le checkout, le profil DBFR et les accès Infra depuis leur configuration courante ; le plugin seul ne contient ni writer ni credentials.

## Exécution

Depuis le checkout Shenron, avec un runtime Bun Aphrody qualifié :

```sh
bun scripts/ops/publish-source.ts --source https://publisher.example/guide --target https://dragonballfr.com/publications/guide --job /absolute/private/source-guide
```

Le mode par défaut prépare `plan.json`. Répéter les mêmes URLs, job et budgets avec `--apply` applique ce plan. Bornes disponibles : `--max-requests` (1–256), `--max-depth` (0–10), `--timeout` (1–1800 secondes). Le slug cible appartient à `/publications/<slug>`, pas à une route arbitraire. Résoudre `SHENRON_SOURCE_CDN_MODULE` (module propriétaire installé) et `SHENRON_SOURCE_CDN_CONFIG` (configuration protégée) depuis Infra ; ne pas inventer de credentials ni d’implémentation de remplacement.

1. Lire les consignes du dépôt et les revendications actives. Examiner l’aide de `scripts/ops/publish-source.ts` et sa politique avant toute écriture. Utiliser ce propriétaire unique pour le crawl, R2 et le writer du catalogue ; ne pas reconstruire Next.
2. Préparer le plan déterministe avec les deux URLs. Vérifier les domaines exacts, les limites du crawl, les objets et leurs SHA-256, les destinations R2 et les notices proposées. Conserver export, politique et captures dans le job protégé ; publier seulement le contenu autorisé par la demande et la politique effective.
3. Appliquer le plan vérifié avec les accès du profil cible hérités du store propriétaire. Réutiliser les capacités natives Aphrody Web, l’uploader R2 propriétaire et `dragon-ball ingest-crawl` ; aucune copie de secrets, aucun writer PostgreSQL parallèle ni modification du schéma.
4. Relire les objets par le domaine CDN public et comparer leurs empreintes. Vérifier indépendamment la publication cible, sa navigation, les identités et la provenance ; contrôler aussi le catalogue paginé si ce lot l’alimente. Rejouer explicitement le même lot pour établir son idempotence : le wrapper ne le fait pas automatiquement.

Une autorisation de publication déjà donnée reste valable : ne pas la redemander. Une source publique ne suffit pas à autoriser un contenu tiers absent de cette autorisation. Conserver les liens officiels quand la politique refuse une copie ; ni contournement DRM ni extraction de session fournisseur. RAG, entraînement et canon restent désactivés sauf demande distincte.

## Propriétaires et preuves

- `aphrody web crawl --help` décrit le crawl borné et sa frontier SQLite ; le wrapper choisit ses limites et son export canonique.
- `packages/pipeline/src/cli.ts dragon-ball ingest-crawl` possède l’import du registre ; son mode sans `--apply` planifie sans ouvrir PostgreSQL.
- `cloudflare-ops r2 --apply` crée un bucket absent, **pas ses objets** : ne pas l’employer comme preuve de livraison du corpus.
- R2 est public via le domaine CDN configuré, jamais par un store de credentials ou une URL signée publiée.

Exécuter les jobs longs en arrière-plan avec délai maximal et statut terminal explicite. Au premier échec, lire ce statut et le journal avant toute reprise. Rapporter uniquement URL publiques, révision, comptes, SHA-256 et résultats de lecture ; distinguer plan préparé, objets copiés et publication réellement visible. HTTP 200 d’une page vidéo ne prouve pas sa lecture.
