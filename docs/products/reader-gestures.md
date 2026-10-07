<!-- SPDX-License-Identifier: Apache-2.0 -->

# Gestes de la visionneuse des databooks

La visionneuse de `@shenron/ui/reader` conserve une seule implémentation
Pointer Events pour les surfaces web, mobile et bureau. Deux doigts agrandissent
la planche autour de leur centre ; une planche agrandie se déplace sous le
doigt, tandis qu'un balayage horizontal à taille ajustée tourne la page.
Les boutons et raccourcis restent disponibles en parallèle.

Un double tap exige deux appuis proches dans le temps et dans l'espace :
300 ms au maximum et un écart d'au plus 24 pixels CSS. Deux taps éloignés
restent deux gestes distincts. Le doigt restant après un pincement peut
déplacer la planche ; son relâchement ne compte ni comme un tap ni comme un
balayage de navigation.

Un changement de page, le retour à la taille ajustée ou le remplacement de
la surface efface les gestes en cours et libère leur capture. Une annulation
ou une perte de capture interrompt le geste sans changer de page. Le prochain
appui recommence depuis l'état courant.

Le traitement de la perte de capture suit le contrat MDN
[lostpointercapture](https://developer.mozilla.org/en-US/docs/Web/API/Element/lostpointercapture_event).
La capture implicitement libérée après un relâchement normal ne doit pas
annuler le déplacement du doigt restant : l'identifiant déjà relâché est
retiré avant de recevoir cet événement.

## Validation

Le 7 octobre 2026, quatre défauts ont été reproduits dans les tests DOM avant
correction : taps éloignés interprétés comme un double tap, état conservé après
un changement de page, geste bloqué après perte de capture, tap parasite en
sortie de pincement. Le retour à la taille ajustée pendant un déplacement
est aussi couvert par un test de régression.

Commande ciblée, depuis `packages/ui` :

```sh
bun test --preload @aphrody/bun-test-dom ./test/dom/reader.test.tsx
```

Un profil Chromium temporaire isolé, à 390 × 844 pixels CSS, a également
validé des événements tactiles CDP : taps éloignés, fin de pincement,
annulation, changement de page pendant un geste, pincement et remise à taille
ajustée. Le banc d'essai et ses résultats locaux vivent dans
`var/reports/reader-gestures/`, hors Git. Il monte le hook réel sur une surface
de test ; il ne représente pas une validation visuelle de toute l'interface
ni un essai sur un appareil mobile physique.

La suite UI complète passe : 275 tests, aucun échec. Le typecheck et la
conformité du paquet passent, ainsi que le format ciblé. Le lint ciblé reste
sans erreur ; les deux avertissements déjà présents sur l'effet de remise
à zéro du zoom sont inchangés.
