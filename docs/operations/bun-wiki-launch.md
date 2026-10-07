# Ouverture des rubriques sur le serveur Bun

Le registre de navigation et les règles d’accès vivent dans
`@shenron/config/wiki-launch`. La normalisation de `openKeys`, `order` et
`access` appartient à `@shenron/config/wiki-launch-config`. Les anciens modules
du site conservent les imports existants ; aucun registre parallèle n’est créé.

Le serveur Bun possède la connexion PostgreSQL à `WikiLaunch`, avec un pool
paresseux de deux connexions. Le contrat expose :

| Route | Autorité | Résultat |
| --- | --- | --- |
| `GET /api/v1/site/launch` | Lecture publique | `{ config }` |
| `POST /api/v1/site/launch` | Administration native | `{ ok: true, config }` |

Les réponses sont `no-store`. La sauvegarde accepte un sous-ensemble des trois
champs et limite le corps à 512 Kio. La transaction crée le singleton si
nécessaire, verrouille sa ligne puis fusionne le patch avec la version courante.
Deux sauvegardes partielles concurrentes ne peuvent donc plus perdre un champ
non transmis. L’identité `updatedBy` est résolue par le serveur, jamais depuis
le document envoyé par le client.

La normalisation conserve les anciennes clés françaises, la priorité des clés
actuelles, les rubriques toujours ouvertes et le repli d’une restriction par
rôle sans rôle valide vers les membres connectés. Les règles par rubrique restent
des remplacements explicites du champ `access`, comme dans l’éditeur existant.

## Consommation par Next

`SHENRON_HOST_URL` désigne le serveur Bun. Le module du site ne charge plus le
driver PostgreSQL. Il conserve le cache de trente secondes du chemin de
navigation, partage une seule lecture HTTP en vol et garde la dernière politique
lue en cas de panne. Sans politique lue, les défauts historiques s’appliquent.
Une réponse ancienne ne peut pas remplacer une sauvegarde réussie.

La route historique `PUT /api/wiki-launch` garde sa garde administrateur et la
revalidation du layout ; elle transmet les cookies, l’autorisation ou le jeton
administratif serveur à l’hôte. Un hôte absent refuse une sauvegarde avec un
statut 503 ; aucune écriture locale de remplacement n’est activée. La lecture
HTTP est bornée par le délai de dix secondes du client partagé.

Cette migration retire la persistance de ce réglage de Next. Le proxy de pages
reste un consommateur de la politique : elle ne qualifie pas la suppression de
tous les autres accès PostgreSQL de Next, les fournisseurs OAuth, ni l’activation
de ces routes sur DBFR.

## Qualification du 7 octobre 2026

- Six fixtures donnent la même normalisation que le module précédent ; le
  registre complet est déplacé sans changement de contenu.
- PostgreSQL temporaire isolé : deux premières sauvegardes concurrentes,
  conservation des champs distincts, JSONB objet, identité d’audit, normalisation
  des clés et des rôles, absence de cache HTTP et refus d’un patch vide.
- Tests du site : lecture partagée, politique conservée pendant une panne,
  réponse tardive après sauvegarde, transmission des credentials, hôte absent,
  anciennes clés, garde administrateur et rejet d’un corps `null`.
- Les typechecks config, db, API et site passent. Les audits de paquets config,
  db et API passent. L’audit global signale séparément un import natif dans
  `packages/pipeline/src/aphrody/native-commands.ts`, appartenant au lot concurrent
  de consommation Aphrody ; ce fichier n’est pas modifié par cette migration.
- Les 17 étapes de `bun scripts/testing/integration/run.ts --no-browser`
  passent : suites des paquets et applications, palette partagée, PostgreSQL
  natif et contrats HTTP croisés. OpenAPI est régénérée et son contrôle passe.
  Le lint scoped ne signale aucune erreur et conserve deux avertissements
  préexistants dans le serveur et l’hôte ; le format et les espaces sont vérifiés.

Le test réel du serveur de développement avec Aphrody Web/Obscura reste rouge
dans la qualification précédente. Les preuves ci-dessus portent sur la politique
et sa persistance ; elles ne prouvent pas un rendu manga complet ni un frontal
de développement entièrement fonctionnel.
