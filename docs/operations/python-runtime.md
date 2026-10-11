<!-- SPDX-License-Identifier: Apache-2.0 -->
# SDK Python natif dans le pipeline

`@shenron/pipeline/runtime/python` est le propriétaire commun du SDK Python
pour les paquets Bun de Shenron. Il est également exporté par la racine du
pipeline. Importer le module ne charge ni CPython, ni fournisseur optionnel.
`openAphrodyPython()` ouvre le `Python.async()` du fork ; Buv résout ses
artefacts CPython et PyJS utilise le même `bun:python`. Aucun lanceur Python,
`uv run`, code Torch copié ou SDK vendored n’est ajouté.

```ts
import { openAphrodyPython } from "@shenron/pipeline/runtime/python";

await using sdk = await openAphrodyPython({
  sourceRoots: [process.env.SHENRON_APHRODY_PYTHON_SOURCE!],
});
const names = await sdk.exports();
const normalized = await sdk.invoke(
  "aphrody.command_guard", "normalize_command", ["café🐍"],
);
await using guard = await sdk.construct("aphrody", "CommandGuard");
const verdict = await guard.call("verify_command", ["bun --version"]);
```

L’installation qualifiée peut omettre `sourceRoots` pour consommer le paquet
installé. Des racines explicites doivent être absolues ; le chemin du SDK
chargé est contrôlé contre ces racines. `virtualEnv` ajoute seulement les
site-packages d’un environnement existant et qualifié. Les artefacts natifs
restent sélectionnés par Buv ou les options explicites `libraryPath` et
`libpython`. Sur Windows, les variables du fork sont
`BUN_PYTHON_HOST_LIBRARY`, `BUN_PYTHON_LIBPYTHON` et `BUV_RUNTIME` ; elles ne
sont jamais copiées depuis un autre profil d’authentification.

Les espaces de modules consommés sont `aphrody`, `aphrody_train`,
`aphrody_cli` et `aphrody_embedding_fixtures`, issus des manifests Python
d’Aphrody. Les modules et membres sont sélectionnés explicitement.
`exports()` lit la liste publique sans importer les implémentations
optionnelles. `read()` lit une valeur JSON ; `invoke()` appelle une fonction
avec arguments et mots-clés JSON. `construct()` conserve un objet Python
dans son interpréteur ; ses méthodes `call()` et `retain()` appellent et
conservent leurs résultats. Un objet peut passer comme argument d’un autre
appel dans le même propriétaire. Les résultats JSON et dataclasses sont
sérialisés ; les autres objets nécessitent une conservation explicite.
Les entrées et sorties sont limitées à 1 Mio.

Les acquisitions concurrentes partagent un interpréteur et des baux. Une
configuration différente est refusée pendant son utilisation. La file du
produit accepte 64 opérations en attente, sous la limite de 256 du fork.
Le Worker CPython reste dans le PID Bun ; le contrôle vérifie ce PID au
démarrage. Les appels Python asynchrones s’exécutent dans ce Worker, pas dans
la boucle JS. La dernière fermeture attend les opérations déjà en file,
ferme les objets et leur interpréteur ; une nouvelle acquisition attend la
fin de cette fermeture. Un objet doit se fermer avant son bail SDK. Les
exceptions remontent leur type, sans recopier le message d’un fournisseur
qui pourrait contenir un jeton. Le fork n’expose pas d’interruption sûre
d’un appel Python actif ; ce module ne simule aucune annulation.

L’UV embarqué reconnaît le nom de programme `bun.exe`, `buv.exe` ou
`pyjs.exe`. Un artefact versionné doit garder ce nom dans un répertoire
versionné ; renommer l’exécutable `bun-fleet-<revision>.exe` empêche son
dispatch `uv`. `bun uv --version` et `bun uv python install --help` qualifient
la surface installée sans installer un interpréteur.

L’entraînement, l’inférence, la collecte et les builds lourds suivent
l’allocation des hôtes : Omar GPU, VPS usine/crawler, DBFR production. Le
poste de développement ne lance que les contrôles légers Bun/Python.
Exposer les noms publics du SDK ne qualifie pas automatiquement les
dépendances, modèles, pilotes, droits ou services de chaque module. Les
cookies, secrets, sessions brutes et données de profils restent dans leurs
stores existants. Aucune synchronisation de mémoire fournisseur n’est
impliquée.

Le test `packages/pipeline/test/runtime/python.live.test.ts` exige les
artefacts natifs et `SHENRON_APHRODY_PYTHON_SOURCE`, puis appelle réellement
le SDK et ses classes en CPU. Il échoue sans qualification ; il ne remplace
pas un essai GPU ou entraînement. Les tests de protocole couvrent les baux,
les paramètres structurés, les objets, l’isolation et la fermeture.

Réception du 9 octobre 2026 : Bun `1.4.3-aphrody.4 (41211b568)` réussit le
test natif CPU avec CPython 3.12.15 : mêmes classes `Python` pour les trois
aliases, même PID, version et exports différés du SDK, normalisation Unicode,
classe `CommandGuard`, méthode réelle et module `.pyts` qui appelle le même
propriétaire. L’UV embarqué déclare 0.12.24 pour Windows MSVC. Cette preuve
locale ne qualifie ni les dépendances GPU d’Omar, ni le packaging Linux,
ni toutes les capacités de la dernière révision source du fork.
