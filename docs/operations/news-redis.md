# Miroir Redis des articles publics

PostgreSQL `public."Post"` reste la source éditoriale. Le CMS partagé par les
actions admin et l’API agent maintient un miroir reconstructible dans Redis DB4,
distinct du cache des databooks : `dbfr:post:<id>` contient un JSON public et
`dbfr:posts:all` contient les identifiants. L’identifiant stable évite de conserver
une ancienne clé après changement de slug. Chaque JSON et le set expirent après
24 heures ; la lecture du set retire les identifiants dont le JSON a expiré.

Seuls les articles `published=true`, `status=published`, avec une date de
publication valide et passée, sont indexés. Un brouillon, un statut programmé ou
une date future retirent le JSON et l’appartenance au set. Ce miroir exclut
intentionnellement les articles encore marqués `scheduled`, même après leur date.
Il ne remplace pas le filtre public PostgreSQL ni les pages ISR.

Le JSON ne porte que l’identifiant, le slug, le titre, l’extrait, le HTML public,
la couverture et son texte alternatif, les tags, le lien canonique, les URLs
citées dans le HTML et les dates de publication/mise à jour/cache. Les URLs citées
ne constituent pas une certification automatique de source primaire. Aucun
auteur, utilisateur, nom d’agent, credential ou document privé n’y entre.

Après succès PostgreSQL, `indexPost` ou `forgetPost` opère en best effort. Une
panne Redis préserve le succès PostgreSQL et produit un diagnostic borné
`posts_cache` avec `cached=false`, sans connexion ni contenu dans le journal.
Les lecteurs renvoient `null` en cas d’indisponibilité. Aucun `FLUSH` n’est utilisé.

## Reconstruction propriétaire

Le script lit seulement les colonnes publiques de PostgreSQL et reconstruit via
le même contrat que le CMS. Les variables `DATABASE_URL` et Redis sont injectées
par le store protégé de l’Infra ; aucune valeur ne doit être passée en argument.
Exécution sous le Bun Aphrody qualifié ; le contrat partagé pur évite tout import
`server-only` dans la CLI :

```sh
bun scripts/ops/rebuild-news-redis.ts
bun scripts/ops/rebuild-news-redis.ts --apply
```

Sans `--apply`, seul le plan PostgreSQL est lu. Avec `--apply`, le script retire
les anciens membres absents du catalogue public, indexe les fiches admissibles,
retire les fiches exclues, puis compare chaque JSON et le nombre de membres au
plan PostgreSQL. Les reçus ne contiennent que des compteurs, jamais de secret.
Les clés orphelines absentes du set expirent sous 24 heures ; aucun balayage global
de Redis n’est nécessaire. Une reconstruction échouée doit être réessayée après
résolution de la panne : elle n’est pas une écriture PostgreSQL et ne certifie
aucun succès de cache tant que la vérification n’est pas passée.
