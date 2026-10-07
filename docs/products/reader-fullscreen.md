<!-- SPDX-License-Identifier: Apache-2.0 -->

# Plein écran du lecteur : durée de vie native

Le hook partagé `useTauriFullscreen` fait suivre à la fenêtre de bureau le plein
écran DOM du lecteur manga ou databook. Il ne modifie pas une fenêtre déjà en
plein écran avant son intervention, ni les éléments hors de sa portée.

Les notifications DOM sont traitées dans l’ordre : une seule décision de plein
écran natif s’exécute à la fois. Si la lecture de l’état natif se termine après la
fermeture du lecteur ou sa sortie du plein écran DOM, aucune entrée n’est lancée.
Si une entrée native est déjà en cours, sa réponse tardive est suivie d’une sortie
lorsque le lecteur a disparu ou a quitté le plein écran. Le démontage attend
ainsi la fin de l’opération pour restituer la fenêtre dont ce hook est propriétaire.

## Qualification du 7 octobre 2026

Le test avec IPC Tauri retardé échouait avant le correctif : après démontage,
seule la commande d’entrée était envoyée et la fenêtre restait agrandie.
Il vérifie désormais la restitution après démontage et après sortie DOM,
ainsi que les notifications répétées pendant la même commande native.
Les tests existants couvrent le plein écran normal, F11 préalable, les permissions
refusées, la portée du lecteur et l’absence de commandes dans un navigateur.

L’IPC est simulé dans cette qualification. Une installation Tauri physique et le
mode épinglé de secours de `useFullscreen` restent à qualifier séparément ; ces
tests ne prouvent pas tous les comportements natifs du bureau.
