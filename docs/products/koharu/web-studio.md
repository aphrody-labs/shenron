<!-- SPDX-License-Identifier: Apache-2.0 -->

# Shenron Studio dans le navigateur

`/studio` monte le même éditeur et le même canevas WASM WebGPU que Shenron Studio
de bureau. Le fichier `packages/ui/test/koharu/mocks/koharu_canvas.ts` reste une
fixture de tests ; il n'est jamais importé par l'application.

Le site détecte d'abord le moteur local, puis `/api/studio/health`. Le pont web
nécessite une session staff réelle relue par l'API canonique du serveur, un SDK réel et un
store privé configurés. La présentation reste disponible pour les visiteurs
sans accès ; aucun faux éditeur ni faux résultat de traitement n'est affiché.

Le binaire `koharu-sdk` est construit sur la fabrique :

```sh
cargo build --release --locked -p koharu-library --bin koharu-sdk
```

Infra livre le SDK scellé dans l'image puis configure `SHENRON_STUDIO_SDK_BIN`
(chemin absolu) et `SHENRON_STUDIO_HOME` (store persistant privé, accessible
uniquement au compte du site). Les fichiers du store ne vont jamais dans
l'image publique. Le SDK démarre avec `--root` et `--web-io-root` propres à
l'identité ; son environnement conserve uniquement les chemins nécessaires
au runtime, sans jeton, base, cookie ou session fournisseur du serveur.

Les imports proviennent du sélecteur de fichiers du navigateur : jusqu'à
100 fichiers et 96 Mio de requête. Le site génère les chemins temporaires,
le SDK vérifie indépendamment leur confinement puis le site les retire après
consommation. Les exports utilisent un nouveau chemin privé : CBZ téléchargeable,
ou archive tar.gz pour les planches PNG/PSD, limités à 256 Mio et 1 000 fichiers.
Les commandes ordinaires n'acceptent pas de sélection de chemin `_web*`.

Le pont `/api/local/koharu` reste réservé à la machine locale et désactivé
en production. Le propriétaire de son protocole stdio partagé est désormais
`@aphrody/shenron-koharu/web-server` ; `apps/server` le consomme, sans copie.
Le pont web limite le nombre de moteurs à quatre et les arrête après 30 minutes
sans requête. Ces limites applicatives ne constituent pas un quota disque OS.

La qualification de livraison exige un SDK réellement construit, les tests
Rust de confinement, un import réel, un canevas rendu, une modification persistée
et un export téléchargé à 1 200 et 390 pixels. Les tests UI mockés et la présence
du fichier WASM ne suffisent pas à établir cette livraison.
