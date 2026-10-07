# Connexion de Shenron Studio sur le serveur Bun

`/api/desktop/link` est servi par `@shenron/api/host`, dans le frontal autonome
comme dans son serveur Bun direct. Il lit exclusivement la session Better Auth
du backend. Les identités d'automatisation et les en-têtes de propriétaire ne
permettent pas d'émettre un code de connexion Discord.

Le contrat existant est conservé : état validé, port non privilégié, callback
sur `127.0.0.1`, code signé HMAC-SHA-256 lié à l'état, durée de deux minutes,
langue du cookie `NEXT_LOCALE`. La signature partagée vit désormais dans
`packages/api/src/desktop-link.ts` ; le fichier du site réexporte ce contrat.

La route Next est un relais sans accès à la base, à la session ou au secret.
La vérification `/api/desktop/link/verify` suit le même chemin : corps JSON
limité à 8 Kio, contrôle du code et de l'état, identité ou erreur sans cache.
Elle requiert `SHENRON_HOST_URL`. Sans hôte configuré ou lorsque celui-ci ne
répond pas, elle retourne `503 auth_unavailable`, sans cache. Le frontal Bun
intercepte la route avant Next. L'authentification du backend et un secret
`BETTER_AUTH_SECRET` (ou son alias `SESSION_SECRET`) d'au moins 32 caractères
sont nécessaires pour émettre un code. Une personne sans session est redirigée
vers `/signin`, avec un callback relatif conservant son état et son port.

Les tests `packages/api/test/desktop-link.test.ts` vérifient les requêtes
invalides, les indisponibilités et l'absence de privilège implicite. Deux
serveurs HTTP Bun jetables vérifient les modes de montage, le callback, la
langue, la liaison à l'état et l'expiration. Ils utilisent une session
synthétique et n'accèdent pas à une base de production. Le parcours OAuth réel
sur un appareil et la migration complète de l'authentification du site restent
à qualifier séparément.
