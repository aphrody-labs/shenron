<!-- SPDX-License-Identifier: Apache-2.0 -->

# Métadonnées Crunchyroll authentifiées

Le pont `/api/admin/video/crunchyroll/*` vérifie une session Better Auth auprès de
l'hôte Bun et le rôle administrateur courant. Il réutilise exclusivement le client
de `@aphrody/bun-video/crunchyroll/api` : `status`, `anime/:id`,
`anime/:id/seasons`, `seasons/:id/episodes` et `search?q=...`.
Le paramètre `lang=fr|en|ja` sélectionne la locale du fournisseur.

La configuration serveur accepte soit `BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN`, soit
`CRUNCHYROLL_EMAIL`, `CRUNCHYROLL_PASSWORD` et
`BUN_VIDEO_CRUNCHYROLL_BASIC_AUTHORIZATION` ensemble. Le dernier champ est
l'autorisation d'une application effectivement attribuée par le fournisseur ;
le pont n'en génère aucune. `BUN_VIDEO_CRUNCHYROLL_ACCOUNT_ID` est facultatif.
Les valeurs restent dans les stores privés et la configuration d'exécution ;
aucune variable n'est publique ou transmise au navigateur.

Les cookies Crunchyroll et la session Better Auth sont indépendants. Sans
configuration fournisseur, `status` indique `configured: false` et les appels
métadonnées répondent 503. Les réponses portent `private, no-store` ; seules
les données de contenu autorisées sont retournées, sans liens de flux, jetons,
signatures CMS, cookies ou réponses de licences. Les opérations fournisseur ont
un délai de dix secondes et ne suivent aucune redirection.

L'hôte Bun active le fournisseur Better Auth `crunchyroll` uniquement lorsque
`CRUNCHYROLL_OAUTH_CLIENT_ID` et `CRUNCHYROLL_OAUTH_DISCOVERY_URL` sont fournis ;
`CRUNCHYROLL_OAUTH_CLIENT_SECRET` est facultatif pour un client public PKCE
effectivement enregistré. La discovery OIDC explicite doit utiliser HTTPS,
un domaine Crunchyroll, sans identifiants ni paramètres secrets. Aucun issuer
n'est présumé. Le plugin exige une identité OIDC vérifiée, PKCE et le flux code ;
l'inscription implicite est désactivée. Les tokens nouvellement enregistrés
sont chiffrés par Better Auth ; son lecteur 1.7.6 conserve la compatibilité avec
les anciens tokens en clair, sans migration SQL parallèle.

Le POST `/api/admin/video/crunchyroll/connect` exige une session administrateur
et une origine identique, puis relaie `link-social` auprès de l'hôte. Better Auth
possède le state, le callback et ses cookies sécurisés. La destination après
liaison est `/admin`. Pour les appels métadonnées, le pont demande d'abord le
token de l'account Crunchyroll lié à la session courante via `list-accounts` et
`get-access-token`, avant la configuration globale. Le token n'est jamais inclus
dans la réponse du pont. Sans application fournisseur enregistrée, la liaison
OAuth reste indisponible ; aucune validation en production n'est annoncée.

Ce pont n'implémente ni une inscription OAuth chez Crunchyroll, ni un serveur de
licences DRM, ni une extraction de flux protégé. Better Auth 1.7.6 peut consommer
une application OAuth enregistrée ; l'identifiant et les endpoints doivent
provenir du contrat du fournisseur. La documentation publique consultée le
14 octobre 2026 fournit un [portail partenaire](https://docs.prd.partner.crunchyroll.com/),
dont le contenu exige une connexion distincte. Le SDK installé reste une
migration du client crunchyroll.js ; sa présence ne qualifie pas les endpoints
en production.

Les locales `subtitle_locales` restent des métadonnées de disponibilité. Elles
ne deviennent pas des pistes de lecture. Les fichiers externes qualifiés
passent par le handoff Bun Video et le writer éditorial existants ; les langues
sont normalisées par `normalizeVideoSubtitles` (`jp` devient `ja`). Aucune langue
absente n'est ajoutée, aucun doublage n'est déduit d'une piste de sous-titres.
