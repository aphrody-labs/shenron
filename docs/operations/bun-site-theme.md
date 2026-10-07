# Thème du site sur l’hôte Bun

Quand `SHENRON_HOST_URL` est configurée, le layout lit le thème par
`GET /api/v1/site/theme`. Next ne charge pas son module DB. Une erreur ou une
réponse invalide rétablit la palette par défaut, avec le délai de dix secondes
du client API. Le contrat, les valeurs par défaut et la résolution défensive
sont partagés dans `@shenron/config/site-theme`.

L’hôte ouvre un pool Bun.SQL paresseux quand `DATABASE_URL` est configurée et
le ferme à son arrêt. Il utilise la table `SiteTheme` existante, son singleton
`default` et un upsert atomique. Aucune migration ni écriture de production
n’a été exécutée pour cette livraison.

`POST /api/v1/site/theme` exige l’autorisation admin de l’API. Le backend
résout l’auteur depuis l’identité authentifiée ; un champ `updatedBy` envoyé
dans le corps est ignoré. Les couleurs sont limitées aux valeurs hexadécimales
et le rayon à 0–2 rem avant stockage ou émission CSS. Les lectures sont
`no-store`, sans ETag périmé après un enregistrement.

L’adresse historique `PUT /api/theme-config` conserve sa garde admin et sa
revalidation du layout. Après cette garde, elle relaie les identifiants de la
requête et, s’il existe, le jeton admin configuré vers Bun. Ce jeton reste côté
serveur. La nouvelle API applique encore sa propre autorisation.

Sans `SHENRON_HOST_URL`, le mode historique Next reste isolé dans
`theme-config-legacy.ts` pour préserver les profils encore non migrés. Son
retrait et la qualification OAuth réelle restent ouverts ; ce lot ne constitue
pas la sortie complète du backend de Next.

## Qualification reproductible

```sh
bun scripts/testing/integration/postgres.ts
bun run test:integration --no-browser
```

Le runner démarre un PostgreSQL installé dans un cluster temporaire, uniquement
sur loopback, crée `shenron_theme_fixture`, exécute le test HTTP sur Bun.SQL,
puis ferme le serveur et supprime le cluster, y compris après un échec.
Il cherche `postgres` dans le `PATH` ou sous `/usr/lib/postgresql/` ;
`SHENRON_POSTGRES_BIN` peut désigner un exécutable installé. Il n’installe rien
et n’ouvre aucune base produit. Cette étape fait partie du pipeline dédié ;
un fournisseur absent est un échec explicite.

Le test PostgreSQL refuse toute URL hors loopback ou hors de cette base dédiée.
Il vérifie le singleton après deux écritures, l’auteur, le timestamp, la
relecture HTTP et `jsonb_typeof(data) = 'object'`. Cette dernière assertion a
détecté un double encodage JSONB avec Bun.SQL/Drizzle 0.45.3 : le dépôt lie
désormais le document comme texte paramétré avant conversion PostgreSQL en
JSONB. L’[upsert Drizzle](https://orm.drizzle.team/docs/guides/upsert) reste
atomique ; aucune chaîne JSON n’est interpolée dans le SQL.

Les tests Next vérifient la délégation sans initialisation DB, la transmission
des identifiants et le repli sur les défauts. Ces fixtures ne qualifient pas
les permissions ou les données des services de production.
