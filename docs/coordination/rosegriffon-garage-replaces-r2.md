# Note de coordination pour rosegriffon : Garage remplace R2 cote shenron

- **Date** : 2026-11-19
- **Auteur** : agent shenron (etape 4 de `.claude/goal.json`, ADR 0009)
- **Sens** : shenron vers rosegriffon. Aucun service rosegriffon n'a ete touche.

## Ce qui change pour shenron

Le bucket R2 `shenron-cdn` et le Worker `shenron-cdn` sont remplaces par un cluster Garage (S3, Rust) natif sous systemd, declare dans `deploy/garage/cluster.toml` : noeuds `fr1` et `fr2` actifs, `prd` prepare mais non installe, facteur de replication 2.

- Les ports Garage sont lies a l'adresse maillee WireGuard de chaque hote (`deploy/environment.json`, `triad.<cle>.meshIp`), jamais a l'IP publique : RPC `3901`, S3 `3900`, admin `127.0.0.1:3903`.
- Bucket `shenron-cdn`, cles `shenron-cdn-ro` (serving) et `shenron-cdn-rw` (miroir). Les secrets restent sur les hotes (`/etc/garage`, root et utilisateur `garage`, mode 0600).
- Bascule DNS et route Worker : pas encore. Elle a lieu quand `shenron-edge` sert `cdn.` (runbook `docs/runbooks/cdn-garage-cutover.md`).

## Ce que rosegriffon doit savoir

- Le tableau « Shared with the sibling product » d'`AGENTS.md` donne la propriete de `cdn-sync` (R2 origin) a rosegriffon. Cette etape ne touche pas `rosegriffon-cdn` ni `infra/docker/cdn-sync` : le miroir ne lit que le bucket `shenron-cdn`.
- Si rosegriffon veut ses objets sur Garage, deux voies sans copie de code : creer son propre bucket et ses cles sur le meme cluster (`garage bucket create`, `garage key create` sur `fr1`), ou reutiliser `scripts/ops/r2-to-garage.ts` (parametrable par `R2_BUCKET` et `GARAGE_BUCKET`). La capacite est limitee : `fr2` n'a que 43 GiB libres, le bucket shenron en occupe 35 GiB, donc un second bucket attend le noeud `prd` (3 zones, chaque noeud garde environ 2/3 des donnees).
- Ajouter ou retirer un noeud passe par `deploy/garage/cluster.toml` puis `garage layout` : ne jamais modifier la disposition a la main sur un seul hote sans mettre ce fichier a jour.
- Pour modifier cette propriete (ex. rosegriffon reprend le cluster), editer le tableau d'`AGENTS.md` dans les deux depots dans le meme geste, comme le contrat l'exige.
