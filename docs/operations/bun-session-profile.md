<!-- SPDX-License-Identifier: Apache-2.0 -->

# Profil de session servi par Bun

Lorsque `SHENRON_HOST_URL` est configurée, `getCurrentUser()` du site lit
`GET /api/v1/account/session` sur l’hôte Bun. Celui-ci valide la session Better Auth
sans cache de cookie puis synchronise le profil métier en PostgreSQL avec le
référentiel partagé. Next ne charge ni son client DB ni son instance Better Auth
pour cette résolution de lecteur. Il ne conserve pas le résultat dans son cache
de profil de 60 secondes : nom, avatar et droits reflètent la lecture de l’hôte.

Le contrat renvoie `null` pour une session absente, ou l’identifiant de session,
l’identifiant Discord et le profil métier public. Une session pas encore liée à
Discord garde un profil `null`. Les dates sont sérialisées en ISO et reconverties
en `Date` par le site. Aucun email, token de session ou secret OAuth n’est envoyé.
La réponse porte `Cache-Control: no-store` et aucun ETag.

La route utilise uniquement le port de session Better Auth. Un jeton admin ou un
propriétaire signé ne crée pas une identité de lecteur. Le client Next transmet
uniquement cookie et Authorization, refuse les redirections, valide le schéma et
échoue sans repli vers une DB locale en cas d’erreur de l’hôte.

## Qualification du 7 octobre 2026

Un serveur Bun réel avec la table native de routes vérifie les changements de
profil et de droits, les sessions révoquées et non liées, l’absence de cache,
HEAD, les méthodes refusées et l’absence de route sans port de session.
Le test du site utilise un hôte HTTP éphémère et interdit le chargement de ses
modules DB et Better Auth ; il vérifie également la validation des réponses,
les en-têtes transmis et la panne amont.

Le mode sans `SHENRON_HOST_URL` conserve encore Better Auth, la résolution DB et
le cache locaux pour la transition. Les identités d’automatisation (cookie admin,
IP et clés d’agent) ont encore une résolution locale distincte, conservée pour
préserver leur journal d’écriture. Leur transfert complet, l’activation de l’hôte
en production et OAuth Discord réel restent à qualifier. Cette livraison ne
constitue pas la sortie complète de tous les accès DB de Next.
