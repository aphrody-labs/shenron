# Instructions agents

Bibliothèque publique `@aphrody/shenron-dbxv2` : client typé du serveur DBXV2 (`scripts/ops/dbxv2-serve.ts`), plugin Bun `dbxv2:` et adaptateurs facultatifs vers le backend privé. Publication publique autorisée par le propriétaire le 20 octobre 2026.

- Le paquet distribue le code et sa licence. Les dérivés publics approuvés utilisent un manifeste explicite avec URL HTTPS immuable, SHA-256 et provenance. Aucun identifiant Steam, jeton, fichier de session, base privée ou chemin du serveur dans Git ou un artefact public ; les tests utilisent un serveur factice.
- Le client public ne reçoit aucun jeton et omet les credentials navigateur. Les accès privés conservent leurs gardes ; leur disponibilité en production ne les rend pas publics.
- Le WASM distribué analyse les formats du jeu ; il ne constitue pas un port du jeu original ni une preuve de streaming fonctionnel.
- Aucun parseur ici : la conversion appartient au serveur et à `@shenron/dbxv2`.
- Jamais de jeton dans une URL ou un journal. Code et identifiants en anglais, documentation en français.
