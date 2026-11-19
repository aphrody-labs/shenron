# Runbook : Garage remplace R2 et le Worker `shenron-cdn` (ADR 0009, etape 4)

Etat au 2026-11-19 : le cluster Garage tourne sur `fr1` et `fr2`, le bucket est copie depuis R2 et verifie, le DNS et la route Worker ne sont pas touches. La bascule a lieu quand `shenron-edge` (etape 3) sert `cdn.`.

Resultat du miroir complet (2026-11-19, `fr1`, 2333 s de copie) : source 181584 objets / 37794764985 octets, destination 181584 objets / 37794764985 octets apres retrait d'un objet de test, 0 echec, 0 manquant, 0 taille differente, 0 sha256 different (181584 relus depuis Garage). Parite : 1000 chemins tires des manifestes (graine 20261119), 0 difference entre le Worker public, Garage et le resolveur Garage de `fr2`.

Point d'attention disque : apres le miroir, `fr2` a 5.6 GiB libres sur 96 GiB (Garage : 35 GiB de donnees + 0.5 GiB de metadonnees par noeud). Ne rien ajouter au bucket tant que `prd` n'a pas rejoint le cluster.

## 1. Architecture

| Element | Valeur | Source |
| --- | --- | --- |
| Cluster | Garage `v2.5.0`, binaire musl officiel, sha256 epingle | `deploy/garage/cluster.toml` |
| Noeuds | `fr1` (zone `fr1`), `fr2` (zone `fr2`), `prd` (zone `prd`, prepare, non installe) | `cluster.toml` `[[nodes]]` |
| Replication | 2 copies, `consistency_mode = "consistent"`, LMDB | `cluster.toml` |
| Adresses | RPC, S3 sur l'adresse maillee WireGuard de chaque hote, admin sur `127.0.0.1` | `deploy/environment.json` `triad.<cle>.meshIp`, ports de `[ports]` |
| Donnees | `/var/lib/garage/{meta,data}` sur le disque racine (`fr1` 290 GiB, `fr2` 96 GiB) | `cluster.toml` `[paths]` |
| Secrets | `/etc/garage/rpc_secret`, `/etc/garage/admin_token` : generes sur l'hote, mode 0600, jamais affiches ni commits | `deploy/garage/install.sh` |
| Bucket | `shenron-cdn`, cles `shenron-cdn-rw` (miroir) et `shenron-cdn-ro` (lecture, serving et parite) | `cluster.toml` `[bucket]` |

Disposition des cles du bucket (inchangee par rapport a R2) : `_migration/manifests/<publication>/<xx>.json` (256 shards, `xx` = deux premiers hex du sha256 du chemin public), `_objects/<sha256>` (contenu adressable). Les chemins publics (`/_next/static`, `/assets`, `/media`, ...) ne sont pas des cles : ils passent par les manifestes.

Garage est lie a l'adresse maillee uniquement : le chemin public ne peut pas etre l'endpoint website de Garage (il exposerait `_objects/` et ne connait pas les manifestes). Le service public est donc un resolveur de manifestes devant Garage.

## 2. Installation (idempotente)

Par noeud actif, depuis le poste (aucun secret n'est affiche) :

```sh
bun scripts/ops/garage-config.ts nodes                     # noeuds, statut, adresse maillee
bun scripts/ops/garage-config.ts render <noeud>            # garage.toml du noeud
# sur l'hote, en root : deploy/garage/install.sh <version> <sha256> <url> [--rpc-secret-stdin]
# le premier noeud genere rpc_secret ; les suivants le recoivent par stdin (ssh fr1 'sudo cat /etc/garage/rpc_secret' | ssh <hote> 'sudo ... --rpc-secret-stdin')
```

Disposition (une fois, sur `fr1`) :

```sh
garage -c /etc/garage/garage.toml node connect <id>@<meshIp>:3901
garage -c /etc/garage/garage.toml layout assign <id> -z <zone> -c <capacity_gb>G -t <noeud>
garage -c /etc/garage/garage.toml layout apply --version <n>
garage -c /etc/garage/garage.toml bucket create shenron-cdn
garage -c /etc/garage/garage.toml key create shenron-cdn-rw ; key create shenron-cdn-ro
garage -c /etc/garage/garage.toml bucket allow --read --write --owner shenron-cdn --key shenron-cdn-rw
garage -c /etc/garage/garage.toml bucket allow --read shenron-cdn --key shenron-cdn-ro
```

Capacite : `fr2` n'a que 43 GiB libres pour 35 GiB de donnees (replication 2 : chaque noeud garde tout tant qu'il n'y a que deux zones). Le noeud `prd` (213 GiB libres) ramene chaque noeud a environ 2/3 des donnees ; l'installer avant de remplir davantage le bucket.

### Ajouter `prd` (3e noeud, hors de cette etape)

1. `status = "active"` pour `prd` dans `cluster.toml`, `render prd`, `install.sh ... --rpc-secret-stdin` sur `prd` (verrou `$DEPLOY_LOCK` d'`AGENTS.md`, unite propre a shenron).
2. `node connect`, `layout assign` (zone `prd`), `layout apply`, puis attendre `garage status` : file `ResyncQueue` a 0 sur les trois noeuds.
3. La replication reste 2 : ne jamais la modifier apres coup.

## 3. Miroir R2 vers Garage

`scripts/ops/r2-to-garage.ts` : API S3 des deux cotes (SigV4 interne, `deploy/garage/s3.ts`), reprise sans etat (un objet de meme taille deja present est saute), sha256 calcule pendant la lecture puis verifie (cle `_objects/<sha256>` contre le contenu, `x-amz-meta-sha256` ecrit), uploads multipart de 64 MiB, parallelisme `--concurrency`, `--dry-run` sans ecriture, verification finale (listes, tailles, sha256 relu depuis Garage).

```sh
# R2 : R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY, ou CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (paire S3 derivee)
# Garage : GARAGE_ACCESS_KEY_ID/GARAGE_SECRET_ACCESS_KEY (cle -rw), GARAGE_ENDPOINT par defaut derive de cluster.toml
bun scripts/ops/r2-to-garage.ts --dry-run
bun scripts/ops/r2-to-garage.ts --state /var/tmp/r2-to-garage.state.jsonl --concurrency 96
bun scripts/ops/r2-to-garage.ts --verify-only --state /var/tmp/r2-to-garage.state.jsonl
```

Code retour 0 seulement si 0 echec, 0 manquant, 0 taille differente, 0 sha256 different. A executer sur `fr1` (reseau et CPU), jamais sur le poste.

## 4. Chemin de service

Contrat que `shenron-edge` doit satisfaire pour `cdn.` (reference executable : `deploy/garage/cdn-origin.ts`, qui reutilise le gestionnaire du Worker `deploy/cloudflare/cdn-worker.ts`, donc memes en-tetes) :

1. Chemin public decode puis valide comme dans `publicPath()` du Worker (pas de segment `.`-prefixe hors `.well-known`, pas de `_migration`, `_objects`, extensions sensibles).
2. Shard du manifeste : `sha256(chemin)` deux premiers hex, cle `<serving.manifest_prefix><xx>.json` lue sur Garage (lecture seule), mise en cache memoire.
3. Entree `{sha256, size, contentType, cacheControl}` : lecture de `_objects/<sha256>` sur Garage, `Range`, `If-None-Match` (304), `ETag = "<sha256>"`, `X-Content-SHA256`, `Cache-Control` de l'entree, CORS `*`, en-tetes zero-trust, compression zstd/br negociee.
4. Chemin absent du manifeste et sous `/_next/static/` : proxy vers `serving.dynamic_origin`.

Deploiement du resolveur de reference (jusqu'a ce que `shenron-edge` le remplace), sur le noeud `serving.origin_node` :

```sh
# /etc/garage/cdn-ro.env (root, 0600) : GARAGE_ACCESS_KEY_ID, GARAGE_SECRET_ACCESS_KEY de la cle shenron-cdn-ro
# /opt/shenron/cdn-garage : deploy/garage/, deploy/cloudflare/cdn-worker.ts, scripts/ops/garage-config.ts, deploy/environment.json
# unite : deploy/garage/shenron-cdn-garage.service (ecoute sur <meshIp>:<serving.origin_port>)
```

`shenron-edge` termine TLS (rustls, ACME) pour `cdn.dragonballfr.com` et proxie vers ce resolveur ou implemente le contrat ci-dessus directement. Dans `deploy/edge/*.example.toml` (propriete de l'agent edge), le pool `cdn` pointe aujourd'hui sur `cdn.dragonballfr.com:443` (Worker) : a la bascule il devient `<meshIp du noeud serving.origin_node>:<serving.origin_port>` en `tls = false`, adresses lues dans `cluster.toml` et `environment.json`.

## 5. Controle de parite

```sh
bun scripts/ops/cdn-parity.ts --samples 1000 [--origin http://<meshIp>:<origin_port>] [--seed N]
```

Tire N chemins des manifestes epingles, puis compare le sha256 du corps servi par `serving.public_origin` (Worker actuel), de `_objects/<sha256>` lu sur Garage, du corps servi par le resolveur Garage (`--origin`) et du sha256 du manifeste. Sortie JSON ; code 0 seulement si `mismatches` vaut 0. `--seed` rejoue un echantillon.

## 6. Bascule (a executer quand `shenron-edge` sert `cdn.`)

Etat actuel verifie le 2026-11-19 : enregistrement `A cdn.dragonballfr.com` vers l'IP de `prd`, proxie Cloudflare, route Worker `cdn.dragonballfr.com/*` vers le script `shenron-cdn`, bucket R2 `shenron-cdn`.

1. Prerequis : `shenron-edge` sert `cdn.` en pre-production (hote `fr2`, resolution par `curl --resolve cdn.dragonballfr.com:443:<ip>`), `cdn-parity.ts --samples 1000 --origin ...` a 0 difference, `Range` video verifie (206, `Content-Range`).
2. Figer les ecritures : les publieurs (`deploy/cloudflare/cli/publish-catalog.ts`, `r2-sync`) ciblent Garage (`GARAGE_ENDPOINT`, cle `-rw`) au lieu de R2 ; verifier qu'aucun ne cible plus R2.
3. Rattrapage : `r2-to-garage.ts` complet une derniere fois (sort 0 : 0 manquant, 0 different), puis parite.
4. Basculer : modifier l'enregistrement `A cdn` vers l'IP publique de l'hote `shenron-edge` (API DNS Cloudflare, ou Hickory DNS a l'etape 8), puis supprimer la route Worker `cdn.dragonballfr.com/*` (la route intercepte tout nom proxie tant qu'elle existe). Purger le cache Cloudflare de `cdn.`.
5. Preuve publique : `cdn-parity.ts --samples 1000` contre `https://cdn.dragonballfr.com`, captures navigateur de pages qui chargent images, polices et video (aucune requete en echec, aucune erreur console), puis `curl -I` (absence de `cf-ray`/`server: cloudflare` des que le proxy est quitte).
6. Retour arriere : recreer la route Worker (`wrangler deploy` depuis `deploy/cloudflare`) et remettre l'enregistrement `A` sur l'IP de `prd`. R2 reste intact et en lecture seule jusqu'a la fin de la periode d'observation.
7. Nettoyage (apres 7 jours sans retour arriere) : supprimer le Worker `shenron-cdn`, `deploy/cloudflare/wrangler.jsonc`, `cdn-worker.ts` quand `shenron-edge` ne s'en inspire plus, et le bucket R2 `shenron-cdn`. Passer l'etape 4 de `.claude/goal.json` a `done` avec la preuve de l'etape 5.

## 7. Exploitation

```sh
garage -c /etc/garage/garage.toml status              # noeuds, espace, file de resynchronisation
garage -c /etc/garage/garage.toml bucket info shenron-cdn
garage -c /etc/garage/garage.toml repair --all-nodes --yes tables   # coherence (apres panne)
systemctl status garage ; journalctl -u garage -n 50
```

Pas de pare-feu hote sur `fr1` et `fr2` (`INPUT ACCEPT`) : l'isolation vient de la liaison sur l'adresse maillee. Ne jamais lier Garage sur une IP publique.
