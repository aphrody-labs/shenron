# Instructions agents

Unité privée `@aphrody/shenron-dbxv2` : client typé du serveur DBXV2 (`scripts/ops/dbxv2-serve.ts`), accès à la base privée, plugin Bun `dbxv2:`.

- Aucune donnée du jeu (octets, index, chemins réels) dans Git, un test, un bundle ou un artefact public ; les tests utilisent un serveur factice.
- Aucun parseur ici : la conversion appartient au serveur et à `@shenron/dbxv2`.
- Jamais de jeton dans une URL ou un journal. Code et identifiants en anglais, documentation en français.
