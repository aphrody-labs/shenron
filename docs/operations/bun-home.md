# Configuration de l’accueil sur Bun

Le contrat de l’accueil (scènes, sections, destinations et résolution défensive)
vit dans `@aphrody/shenron-config/home`. Les liens historiques sont résolus par une
seule table partagée dans `@aphrody/shenron-config/legacy-routes`. Les anciens imports
du site réexportent ces modules ; aucune scène ni destination n’a été retirée.

L’hôte Bun expose `GET /api/v1/site/home` sans cache et `POST` avec
l’autorisation admin native. Il ouvre et ferme son pool Bun.SQL et réutilise
le singleton `default` de la table `HomeConfig`, sans migration. Un upsert
atomique lie le JSON comme texte avant conversion JSONB. L’auteur vient de
l’identité authentifiée ; un auteur fourni dans le document ne fait pas autorité.
Les corps dépassant 512 Kio sont refusés avant la résolution.

Next ne stocke plus cette configuration. Son adaptateur HTTP conserve le choix
de la meilleure image existante et la route historique conserve la liste des
clips et la revalidation de l’accueil. Elle transmet les credentials et le jeton
admin configuré côté serveur. Sans hôte, le rendu conserve les défauts et une
écriture retourne 503 ; une panne ne réactive jamais le dépôt DB de Next.

## Qualification

`bun scripts/testing/integration/postgres.ts` vérifie l’upsert, le type JSONB,
l’auteur et les lectures HTTP sur un cluster éphémère isolé. Les tests du site
vérifient le transport et les contenus conservés. Aucune base produit n’est
ouverte par ces tests ; activation en production et OAuth réel restent à qualifier.
