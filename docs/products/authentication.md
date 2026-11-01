# Comptes, sécurité et OAuth Shenron

Les mots de passe créés ou réinitialisés doivent contenir au moins 12 caractères. Le cache
Better Auth des sessions dans les cookies est désactivé afin que révocations, suspensions et
changements de rôle prennent effet dès la requête suivante. Les sessions restent persistées en
PostgreSQL.

Ce document décrit l’authentification partagée entre le site Dragon Ball France et les clients
Shenron. Le propriétaire du serveur Better Auth est `packages/api/src/host/auth.ts` ; le site
relaye `/api/auth/*` vers cet hôte quand `SHENRON_HOST_URL` est défini. La base PostgreSQL
`shenron_site` conserve les utilisateurs, sessions, fournisseurs liés, clés passkeys, clés de
signature et autorisations OAuth.

## Connexion et compte unifié

- Discord et Google sont des fournisseurs sociaux. Google n’est publié que si son identifiant et
  son secret sont tous les deux configurés. Le compte Google doit avoir une adresse vérifiée.
- E-mail/mot de passe exige une adresse vérifiée. Les e-mails de vérification, de réinitialisation
  et de connexion sans mot de passe partent via le SMTP OVH en TLS implicite (`ssl0.ovh.net:465`)
  lorsque `SMTP_PASSWORD` est provisionné. Par défaut, le compte et l’expéditeur sont
  `contact@aphrody.com` ; les variables `SMTP_USER` et `AUTH_EMAIL_FROM` peuvent les remplacer.
  L’API HTTPS Resend reste disponible comme repli. Aucun secret n’est envoyé au navigateur.
- La connexion par lien magique est réservée aux comptes déjà créés. Le mot de passe, le lien
  magique et les fournisseurs sociaux convergent vers le même `ba_user` après association.
- `/settings` affiche les moyens de connexion liés. Pour un compte Google ou Discord sans
  identifiant `credential`, « Configurer » envoie un lien de réinitialisation à l’adresse du compte ;
  son utilisation ajoute un mot de passe au même utilisateur Better Auth. Le préremplissage de
  l’adresse reste dans `sessionStorage` et ne l’ajoute pas à l’URL.
- L’association implicite est désactivée. Une personne connectée associe un fournisseur depuis
  `/settings`; Better Auth n’unit pas automatiquement deux comptes sur la seule égalité d’adresses.
  Garder au moins une méthode de connexion liée avant d’en dissocier une autre.
- Les passkeys sont liées au domaine de production. `/settings` permet d’activer TOTP, de vérifier
  le premier code avant d’enrôler l’appareil, puis d’afficher et télécharger dix codes de secours
  chiffrés côté serveur. Les comptes sociaux sans mot de passe peuvent aussi activer le TOTP ; les
  comptes avec mot de passe doivent le confirmer pour activer ou désactiver le facteur. Les
  tentatives sensibles sont limitées par rate limiter ; Redis est conseillé pour un déploiement
  multi-instance (`REDIS_URL`).
- Les sessions durent 30 jours, sont renouvelées quotidiennement, ont un cache signé court et sont
  lues avec vérification fraîche pour les permissions serveur. Une réinitialisation de mot de passe
  révoque les autres sessions.

Les identités sociales deviennent un compte Better Auth commun après association explicite. Le
profil communautaire historique `users` dépend encore de Discord : une identité e-mail ou Google
seule peut se connecter et gérer son compte/facturation, mais ne reçoit pas automatiquement un
profil Discord pour les fonctions communautaires qui en exigent un.

## Shenron OAuth 2.1 / OIDC et MCP

Le plugin `@better-auth/mcp` fournit l’autorisation OAuth 2.1, OIDC, PKCE, métadonnées de ressource
RFC 9728, liaison audience/ressource, JWT/JWKS, consentement et inscription dynamique RFC 7591.
`@better-auth/cimd` ajoute les Client ID Metadata Documents avec son transport réseau sécurisé.
Le client doit utiliser le flux Authorization Code avec PKCE S256 et vérifier l’audience de
ressource `https://dragonballfr.com/mcp`. Les comptes valident les autorisations à
`/oauth/consent`; les clients de développement et les nouveaux clients voient un écran de
consentement à chaque demande de portée nouvelle.

Les métadonnées OAuth sont servies par `/api/auth/.well-known/oauth-authorization-server` et
`/.well-known/oauth-authorization-server/api/auth`. Les métadonnées de ressource sont disponibles
à `/.well-known/oauth-protected-resource` et `/.well-known/oauth-protected-resource/mcp` pour
l’URI canonique `/mcp`. Le site et
le serveur Shenron relaient ces chemins vers le même handler, sans créer de seconde autorité de
jetons. Utiliser la découverte OIDC/OAuth publiée par cette origine au lieu de coder les endpoints
dans un client. Les portées configurées sont `openid`, `profile`,
`email` et `offline_access` (demandée explicitement). Elles décrivent l’identité et le cycle de
session ; aucun scope `admin` ou d’écriture n’est accordé par défaut.

Le serveur MCP conserve son contrat d’accès existant : lectures publiques anonymes et outils
d’écriture élevés seulement pour les jetons service/IP autorisés du processus `shenron-mcp`.
L’émission d’un jeton OAuth OIDC n’accorde donc pas un droit d’écriture MCP et ne transforme pas
un compte utilisateur en administrateur. Une délégation MCP par utilisateur exigera des scopes
métier, des permissions par outil et une propagation d’identité signée jusqu’aux API. Ne pas
réutiliser un jeton OAuth comme `SHENRON_MCP_TOKENS` ou `SHENRON_API_ADMIN_TOKEN`.

## Variables et mise en service

Les noms d’environnement sont recensés dans [`operations/ENV.md`](../operations/ENV.md).

1. Créer un client OAuth Web Google dans Google Auth Platform pour l’origine canonique. Autoriser
   le callback Better Auth `https://dragonballfr.com/api/auth/callback/google` (et les origines
   explicites d’environnements non-production). Définir `GOOGLE_CLIENT_ID` et
   `GOOGLE_CLIENT_SECRET` sur l’hôte auth et le site ; ne jamais inclure le secret dans `NEXT_PUBLIC_*`.
2. Provisionner par Aphrody Infra `SMTP_PASSWORD` pour la boîte OVH `contact@aphrody.com`.
   `SMTP_USER` et `AUTH_EMAIL_FROM` ont des valeurs par défaut adaptées à ce compte. N’écrire aucun mot de passe
   dans le dépôt, les exemples versionnés ou les journaux. `RESEND_API_KEY` reste un repli optionnel.
   Tant qu’aucun transport complet n’est configuré, la création de comptes e-mail, les liens magiques
   et la récupération par e-mail restent masqués ou échouent fermés ; les connexions sociales
   existantes restent disponibles.
3. Définir les secrets OAuth Better Auth et Discord déjà requis, garder la base de données
   sauvegardée, puis appliquer les migrations via le runbook `aphrody-infra` (jamais `db:push`).
   Migration de cette évolution : `0040_better_auth_features_oauth.sql`.
4. Vérifier les callbacks Google et Discord sur l’origine de production, les messages de
   vérification/réinitialisation, les cookies HTTPS, l’association explicite, TOTP, passkeys,
   découverte OAuth, PKCE, consentement, révocation des sessions et réponse de santé du serveur.

Google Cloud IAM `gcloud iam oauth-clients` crée des clients de fédération IAM et ne remplace pas
un client Google Sign-In de Google Auth Platform. Aucun identifiant de client Web standard n’était
configuré dans l’environnement inspecté ; il faut donc renseigner les secrets Google après création
du bon type de client.

Références : [Better Auth — OAuth Provider](https://www.better-auth.com/docs/plugins/oauth-provider),
[MCP](https://www.better-auth.com/docs/plugins/mcp), [passkeys](https://www.better-auth.com/docs/plugins/passkey),
[double authentification](https://www.better-auth.com/docs/plugins/2fa),
[Google Cloud — clients OAuth](https://developers.google.com/identity/protocols/oauth2).
Conception des paiements : [Stripe — flux d’abonnements et webhooks](https://docs.stripe.com/get-started/use-cases/saas-subscriptions),
[Stripe — checklist de mise en production](https://docs.stripe.com/get-started/checklist/go-live),
[PayPal — vérification des signatures webhook](https://developer.paypal.com/api/rest/webhooks/rest/).
