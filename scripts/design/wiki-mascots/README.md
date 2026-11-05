# Mascottes vectorielles complètes

Goku, Kid Buu et Shenron disposent chacun d'un SVG entier, construit manuellement
depuis une référence inspectée. Ces dessins sont des **créations originales stylisées**,
pas des illustrations officielles converties. Aucun bitmap n'est incorporé aux SVG.

```sh
bun scripts/design/wiki-mascots/index.ts
bun scripts/design/wiki-mascots/index.ts --check
```

Le second appel vérifie l'absence de dérive entre chaque générateur versionné et
le fichier livré ; il ne modifie rien. Le reçu affiché donne taille, nombre de tracés
et SHA-256. Il ne constitue pas une appréciation artistique ou une preuve GPU.

| Mascotte | Générateur | Mesures et limites | Actif |
| --- | --- | --- | --- |
| Goku | [goku.ts](goku.ts) | [goku.md](goku.md) | [SVG](../../../packages/ui/assets/wiki-mascots/goku-full.svg) |
| Kid Buu | [kid-buu.ts](kid-buu.ts) | [kid-buu.md](kid-buu.md) | [SVG](../../../packages/ui/assets/wiki-mascots/kid-buu-full.svg) |
| Shenron | [shenron.ts](shenron.ts) | [shenron.md](shenron.md) | [SVG](../../../packages/ui/assets/wiki-mascots/shenron-full.svg) |

Les captures, masques et comparaisons restent sous `var/reports/wiki-scene-20261103/`.
Les PNG des références restent les mascottes affichées du portail : leur remplacement
n'est pas une conséquence de cette génération. Le cadrage complet, le contenu vectoriel,
la lisibilité à une taille donnée et la fidélité à la référence sont contrôlés séparément.

Le rendu d'un actif pour inspection utilise le propriétaire déjà installé :

```sh
bun plugin/skills/toriyama-svg/scripts/rendu.ts packages/ui/assets/wiki-mascots/goku-full.svg --tailles 512 256 160 85 32 16 --sortie var/reports/wiki-scene-20261103/goku-svg/control
```

`--tailles` désigne ici des **largeurs**, pas des hauteurs : tenir compte du ratio
du personnage pour juger son encombrement dans la page. Les contrôles du site complet,
du moteur WebGPU et du déploiement restent indépendants.
