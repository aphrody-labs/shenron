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
