<!-- SPDX-License-Identifier: Apache-2.0 -->
# koharu-secrets

Stockage des identifiants de Shenron Studio dans le trousseau protégé du système.
Sur Linux hébergé, `KOHARU_SECRET_NAMESPACE` sélectionne le dossier privé
`SHENRON_HOME/.credentials` du compte, avec répertoires en 0700 et fichiers en 0600.
Le nom du foyer doit correspondre au namespace ; les liens et permissions larges
sont refusés. Les remplacements sont atomiques. Ce stockage repose sur les
permissions du système de fichiers, sans exiger Keyutils dans le conteneur.
Les autres sessions conservent leur trousseau natif. Ce paquet distribue uniquement
le code source, jamais les identifiants.

Source : [aphrody-labs/shenron](https://github.com/aphrody-labs/shenron).

Adapté de [koharu-rs/koharu](https://github.com/koharu-rs/koharu). Les auteurs d'origine et la licence source MIT OR Apache-2.0 sont conservés. Cette distribution inclut le texte de la licence Apache-2.0.
