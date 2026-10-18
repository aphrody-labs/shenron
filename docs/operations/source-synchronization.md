<!-- SPDX-License-Identifier: Apache-2.0 -->

# Synchronisation source, plugin et livraison

La synchronisation suit les manifestes et propriétaires du code. `GOAL.md` contient la
demande autorisée et ses lacunes ; `docs/reference/root/PLAN.md` conserve les invariants ;
`REPRISE.md` contient les contrôles datés. Un nombre ancien reste un instantané historique.

Depuis la racine, avec le Bun1.4.4 qualifié :

```sh
bun scripts/ops/sync-source-status.ts
bun scripts/plugin/agy-manifest.ts --check
bun scripts/plugin/build-references.ts --check
```

La première commande relit les12manifestes npm et les manifestes Cargo, calcule leurs SHA256
et interroge les registres publics avec timeout et identités encodées. Son rapport privé
`var/reports/source-sync/latest.json` sépare visibilité source, HTTP404, panne réseau et
métadonnées de publication. Les crates `publish=false` ne sont pas interrogées ni publiées
par ce script. Il n'écrit ni base, ni credential, ni documentation, ni configuration cloud.
Le rapport ne remplace pas l'audit de tarball, l'installation consommateur, les tests ou
les reçus d'activation. Les générateurs plugin proposent les sorties puis leurs checks
confirment la dérive ; leurs notices et références primaires restent obligatoires.

La reprise automatique existante `terminer-la-bascule-cdn-shenron` exécute la collecte
autorisée, ces vérifications et la livraison des lots verts. Elle reste silencieuse si
l'état n'a pas changé, signale une livraison ou un blocage concret, et se désactive quand
les livraisons sont réellement terminées. Elle ne contourne pas l'expiration DS, les
permissions OAuth, une revue obligatoire ou une authentification manquante.

Git local utilise l'auteur propriétaire, `pull.ff=only`, `fetch.prune=true`,
`push.default=simple`, `merge.conflictStyle=zdiff3` et `core.autocrlf=false`. Relire les claims,
commiter uniquement les chemins possédés, fetch et vérifier l'ascendance avant push normal.
La fusion concurrente reste examinée, aucun force-push ni staging global.

SSH passe par Infra avec les profils hôtes existants ; credentials et cookies restent
dans leurs stores. Cloudflare/S3 a ses renouvellements locaux et Infra, tunnel persistant
et audit propriétaire. OVH est interrogé par `infra ovh domain dnssec`, avec profil protégé.
La disponibilité de ces credentials et les droits externes sont vérifiés avant chaque
mutation ; une configuration ne crée pas ces droits. Ne pas fusionner les stores dbfr,
Aphrody ou IECODE.

Le release runner lit ses cibles depuis l'environnement protégé :
`SHENRON_RELEASE_HOST`, `SHENRON_RELEASE_STACK`, `SHENRON_RELEASE_SERVICE_USER`,
`SHENRON_RELEASE_SERVICE_HOME`, `SHENRON_RELEASE_SERVICE_PATH`,
`SHENRON_RELEASE_REMOTE`, `SHENRON_RELEASE_LOG`, `SHENRON_SITE_URL`,
`SHENRON_CDN_URL` et `SHENRON_BOT_URL`. Les valeurs par défaut servent uniquement au
mode historique local ; Infra doit fournir ces variables pour une release distante.
Les credentials Cloudflare/R2 restent hors du dépôt et sont lus par leurs wrappers Infra.

## Capture privée des sources Beerus

Le propriétaire de la collecte est `scripts/data/crawl-beerus-site.ts`. Il conserve les
corps par SHA256, les routes, redirections, règles robots, sitemaps annoncés et références
observées dans `manifest.json` et `inventory.json`. Les iframes et actions de formulaires
sont des références passives ; les candidats API trouvés dans le JavaScript restent
non qualifiés et ne sont pas appelés. Le schéma du backend tiers n'est pas observable.
Un refus robots, une erreur et les files restantes restent dans les reçus ; une ressource
robots.txt n'est lu que pour découvrir les sitemaps ; il ne restreint jamais la traversée (décision du propriétaire, 2026-10-18).

L'index SQLite privé `capture-index.sqlite` contient les captures, provenances et une
recherche FTS5 du texte capturé. Cet index de collecte n'active ni RAG, entraînement,
canon, PostgreSQL public, Redis public ni publication de corps sur le CDN. Une image
HTTP200 reste `publicationRights=unreviewed`, sans droit public déduit du statut.
La décision éditoriale est fournie par l'environnement protégé du job, jamais par une
valeur codée dans le crawler : `SHENRON_CRAWL_PUBLICATION_RIGHTS` accepte
`unreviewed`, `approved` ou `rejected` et vaut `unreviewed` par défaut ;
`SHENRON_CRAWL_PUBLIC_IMAGES_PERMITTED` accepte `true` ou `false` et vaut `false` par
défaut. La valeur `true` pour les images exige explicitement `approved`, sinon le crawl
échoue avant toute capture. Ces variables décrivent l'intention de l'administrateur dans
le reçu ; elles ne publient pas à elles seules un corps sur PostgreSQL, Redis ou le CDN.

Le runner `scripts/data/sync-beerus-site.ts` exige une sortie externe au dépôt, prend
un verrou exclusif et conserve chaque exécution dans un dossier daté unique. Exemple
à exécuter via Infra sur le VPS avec un runtime Bun qualifié :

```sh
bun scripts/data/sync-beerus-site.ts \
  --out /home/ubuntu/.aphrody/profiles/dbfr/corpus/beerus-sync \
  --interval-seconds 900 --iterations 96 \
  --previous /chemin/prive/capture/manifest.json
```

L'intervalle commence après la fin du crawl, sans chevauchement ; il s'agit d'une
collecte périodique, pas d'un flux temps réel garanti. `delta.json` distingue ajout,
changement de SHA, erreur et URL non observée ; une absence ne prouve pas suppression.
SIGINT/SIGTERM attend la fin du crawl courant. Un verrou existant ne se supprime pas
automatiquement. Les reçus distinguent fin d'exécution et couverture exhaustive, qui
reste non prouvée. Conserver le code et le runtime épinglés du job, son PID, son journal
et son statut terminal avant une nouvelle exécution.
