# Bannières de pages sur Bun

Les types, les images par défaut et la résolution des patches vivent dans
`@aphrody/shenron-config/page-banners`. Le site conserve la résolution des chemins
vers les assets et ses imports historiques. Les bannières Daima respectent
l’origine API publique configurée, sur Bun comme dans le site.

L’hôte expose `GET /api/v1/site/banners` sans cache et `POST` avec
l’autorisation admin native. Il ouvre et ferme le pool Bun.SQL, réutilise la
table `PageBanners` existante et son singleton `default`, sans migration.
L’upsert lie le document comme texte avant conversion JSONB. L’auteur provient
de l’identité authentifiée ; un champ fourni dans le corps est ignoré. Les
corps dépassant 512 Kio sont refusés.

Next ne lit ni n’écrit cette table. La route historique garde son contrôle
admin et la revalidation des pages concernées ; elle transmet les credentials
et le jeton admin configuré côté serveur. Sans hôte, les lectures gardent les
images par défaut et les écritures retournent 503. Une panne ne réactive aucun
stockage DB de Next.

## Qualification

`bun scripts/testing/integration/postgres.ts` vérifie l’upsert réel, le type
JSONB, l’auteur, les lectures HTTP et une origine API personnalisée dans un
cluster isolé. Les tests HTTP vérifient les refus d’écriture et la limite du
corps ; les tests du site couvrent le relais des credentials et les erreurs.
Ces tests ne qualifient pas l’activation ni OAuth en production.
