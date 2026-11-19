# shenron-deployd : déployer sans SSH ni git

ADR 0009, étape 1. Crate autonome `crates/shenron-deployd` (son propre `Cargo.lock`, hors espace de travail comme `shenron-tv`), binaire unique `shenron-deployd` : `keygen`, `publish`, `verify`, `agent`.

## Principe

1. Le constructeur (`fr1`, CI) publie : il hache les artefacts (sha256), écrit un manifeste (`service`, `version` = sha git, `artifacts` avec `url` + `sha256` + `size`, sonde de santé, `created_at`), le signe en ed25519 (signature détachée sur les octets exacts de `manifest.json`) et envoie le tout dans le magasin d'artefacts : artefacts, puis `<service>/releases/<version>/manifest.json(.sig)` (immuable), puis `<service>/channels/<canal>/manifest.json(.sig)` (pointeur mutable, écrit en dernier).
2. Chaque hôte exécute l'agent. Il interroge le canal (GET conditionnel, ETag), vérifie la signature contre les clés publiques épinglées, télécharge, vérifie sha256 et taille, décompresse dans `<root>/releases/<service>/<version>`, bascule `<root>/current/<service>` par `rename(2)` (lien relatif), redémarre l'unité (D-Bus via zbus, repli `systemctl`), sonde la santé avec reprises, et revient en arrière si la sonde échoue.
3. Aucun shell distant : pilotage par l'API mTLS de l'agent (`/v1/status`, `/v1/services/{nom}`, `/check`, `/rollback`, `/deploy`).

Garde-fous : une version en échec (santé ou intégrité) n'est pas retentée tant qu'une version plus récente n'est pas publiée ; un manifeste valide mais plus ancien que l'installé est ignoré (anti-rejeu, `created_at`) ; `deploy` explicite (version publiée) contourne ces gardes.

## Configuration

Un fichier TOML (`--config` ou `SHENRON_DEPLOYD_CONFIG`), modèle : `deploy/systemd/deployd.example.toml`. `${VAR}` et `${VAR:-défaut}` sont développés depuis l'environnement. Défauts dérivés du nom de service : unité `<nom>.service`, canal `stable`, `keep = 3`, `restart = "auto"`. Secrets uniquement par environnement ou `*_FILE` : `SHENRON_DEPLOYD_SIGNING_KEY`, `SHENRON_DEPLOYD_S3_ACCESS_KEY`, `SHENRON_DEPLOYD_S3_SECRET_KEY`, `SHENRON_DEPLOYD_STORE_TOKEN`.

Magasins (`[store] kind`) :

- `http` : GET pour lire, PUT (jeton Bearer optionnel) pour écrire.
- `s3` : Garage, MinIO, R2 ; SigV4 intégré, adressage par chemin.
- `dir` : répertoire local ; côté constructeur, c'est la racine d'un serveur statique HTTPS (`public_url` = son URL). Sans `public_url`, les URL sont des `file://` (volume monté).

## Mise en route

```sh
# une fois, sur le constructeur : paire de clés (la clé privée reste sur fr1)
shenron-deployd keygen --out /etc/shenron/deployd-signing          # écrit .key (0600) et .pub

# sur chaque hôte : binaire, utilisateur, unité, règle polkit, configuration
install -m 0755 shenron-deployd /usr/local/bin/
useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin shenron-deployd
sed -e 's|@USER@|shenron-deployd|g' -e 's|@ROOT@|<root>|g' -e 's|@BIN@|/usr/local/bin/shenron-deployd|' \
    -e 's|@CONFIG@|/etc/shenron/deployd.toml|' -e 's|@ENVFILE@|/etc/shenron/deployd.env|' \
    deploy/systemd/shenron-deployd.service.in > /etc/systemd/system/shenron-deployd.service
sed -e 's|@USER@|shenron-deployd|g' -e 's|@UNIT_REGEX@|shenron-[a-z0-9-]+\\.service|' \
    deploy/systemd/50-shenron-deployd.rules.in > /etc/polkit-1/rules.d/50-shenron-deployd.rules
install -d -o shenron-deployd -g shenron-deployd <root>
systemctl enable --now shenron-deployd
```

L'unité de chaque service pointe sur le lien : `ExecStart=<root>/current/<service>/<binaire>`. `DynamicUser` reste désactivé (l'agent possède la racine des versions) ; `ProtectSystem=strict` avec `ReadWritePaths=<root>` ; la règle polkit ne laisse redémarrer que les unités qui correspondent à `@UNIT_REGEX@`.

## Publier (constructeur)

```sh
shenron-deployd --config deployd-publish.toml publish --service shenron-tv \
  --artifact target/release/shenron-tv --health-url http://127.0.0.1:<port>/health
```

`--version` vaut par défaut `git rev-parse HEAD`. Une archive `.tar.gz` est décompressée sur l'hôte.

## Retour arrière

- Automatique : sonde de santé en échec après redémarrage, retour à la version précédente, version marquée en échec.
- Manuel : `POST /v1/services/<nom>/rollback` (mTLS) ; la version retirée est marquée en échec, le canal reste inchangé sans que l'agent la redéploie.
- Version précise : `POST /v1/services/<nom>/deploy` avec `{"version":"<sha>"}`.

## Rotation de clé

Ajouter la nouvelle clé publique à `trust.public_keys` sur tous les hôtes, signer avec la nouvelle clé, puis retirer l'ancienne.

## Vérification

`just deployd-check` (`cargo clippy --all-targets -- -D warnings` puis `cargo test` dans `crates/shenron-deployd`) sur `fr1`, jamais sur le poste, puis un cycle réel publier, agent, retour arrière sur `fr2` avec un service factice.

## Preuve sur fr2 (2026-11-19)

Cycle réel avec un service factice en unité systemd utilisateur (`scope = "user"`, bus de session D-Bus), magasin `dir` servi en HTTP, API mTLS : `rel1` déployé, `rel2` déployé (le PID de l'unité change), `rel3` sans fichier de santé refusé par la sonde (503) et ramené à `rel2`, aucune relance de `rel3` aux sondages suivants, retour arrière manuel puis `deploy` explicite par l'API, artefact altéré dans le magasin (même taille) rejeté sur sha256 sans rien basculer. Même cycle contre une instance Garage 2.5.0 privée (PUT et GET signés SigV4, GET anonyme refusé en 403).
