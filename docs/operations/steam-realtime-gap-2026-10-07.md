<!-- SPDX-License-Identifier: Apache-2.0 -->
# Périmètre Steam DBXV2 : inventaire local et données live — 2026-10-07

## État constaté

`crates/shenron-re/src/steam.rs` ne met pas en œuvre un flux Steam complet ou
temps réel. `scan_dragon_ball_installs` lit les `appmanifest_*.acf` présents
dans les bibliothèques explicitement fournies, puis identifie les jeux Dragon
Ball. `inspect_dbxv2_install` examine les noms et la présence de quelques
fichiers et dossiers dans un répertoire d'installation donné. Ces fonctions
ne contactent pas les serveurs Steam, ne s'abonnent pas à des événements, ne
lisent aucun identifiant ou jeton de compte, et ne téléchargent aucun contenu.

`SteamDepotRecord` et `SteamPlanningLimits` décrivent des structures de
planification; à elles seules, elles ne constituent ni un client Steamworks,
ni une interface officielle de télémétrie. Aucun flux live ni appel aux API
Steam n'a été observé pendant cet audit.

## Suite de travail nécessaire

Pour concevoir une intégration live, préciser la source autorisée et le type
d'événements requis (par exemple état de publication/dépôts exposé par une API
documentée). Vérifier les conditions d'accès courantes auprès de la
documentation Steam officielle, concevoir une collecte limitée aux données
publiques ou explicitement autorisées, et séparer les secrets d'accès du
code, des logs et des manifests exportés. Ajouter ensuite un client isolé,
borné, observable et testé sans collecter les données d'autres profils.

Cette note ne demande ni n'autorise l'accès à un compte personnel, au Steam
Guard, aux fichiers de session, aux sauvegardes de joueurs ou aux serveurs
privés. L'inventaire local existant reste en lecture seule.
