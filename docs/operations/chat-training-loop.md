<!-- SPDX-License-Identifier: Apache-2.0 -->
# Boucle d’entraînement du chat Shenron

`scripts/ops/train-shenron-chat-loop.ts` enchaîne la préparation anti-fuite de
`build-chat-rollouts.ts`, la génération, l’entraînement LoRA fourni par Aphrody,
puis la comparaison de l’adaptateur de référence et du candidat. Il consomme
`aphrody_train.lora` sans dupliquer l’entraînement.

Exécuter sur la machine GPU de build, avec les dépendances installées depuis leurs
lockfiles et le convertisseur llama.cpp déclaré par `APHRODY_LLAMA_CPP_CONVERTER`.
La préparation GPU, les modèles et les critères de qualification sont décrits dans
[le runbook d’entraînement](agy-train.md). Depuis WSL, passer par l’environnement
distant décrit dans [remote-dev](../development/remote-dev.md).

```sh
bun scripts/ops/train-shenron-chat-loop.ts \
  --aphrody /chemin/aphrody \
  --base-model /chemin/models/Qwen3-4B-Instruct-2507 \
  --gguf-model /chemin/models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
  --baseline-adapter /chemin/runs/shenron-chat-v2/adapter.gguf \
  --llama-server /chemin/llama.cpp/build/bin/llama-server \
  --steps 20 --batch 50 --eval-limit 30 --max-cycles 1
```

Pour un run complet, utiliser le nombre de steps du runbook (4 485 pour les
1 495 exemples de référence sur trois epochs), après avoir vérifié le corpus
réel. `--input`, `--soul` et `--out` permettent de déclarer les chemins privés du
profil DBFR. `--teacher` accepte `aphrody` ou `antigravity` ; `--model` choisit
le modèle enseignant. `--limit` reste un alias de `--batch`. `--sleep-sec` fixe
la pause entre cycles ; sans `--max-cycles`, la boucle continue jusqu’au signal
d’arrêt ou à une erreur. Les paramètres numériques doivent être des entiers
positifs. Le port d’évaluation local est `8090`, modifiable par `--port`.

Chaque cycle a un identifiant et un dossier neufs sous `<out>/runs/`. Il fige
ses rollouts, gold, manifeste de génération et persona dans `data/`, conserve
les événements Aphrody dans `training.events.jsonl`, et reçoit l’adaptateur
sous `training/`. Une étape en échec arrête la boucle ; un corpus vide ou un
adaptateur manquant n’est jamais qualifié. Un dossier de run existant n’est
pas écrasé. Le verrou `training-loop.lock` empêche deux boucles de modifier le
même corpus. Après un arrêt brutal, vérifier les processus réels avant de
retirer manuellement ce verrou.

La comparaison démarre deux serveurs llama.cpp successifs, sur la même base
GGUF et le même échantillon gold avec la même persona figée. Le port doit être
libre ; les serveurs sont arrêtés après chaque évaluation. `qualification.json`
consigne les scores et les empreintes de la base d’inférence, des adaptateurs
et du gold. La qualification exige des échantillons non vides de même taille,
zéro erreur d’évaluation, aucune baisse du nombre de réponses ancrées, zéro
refus et zéro mention d’IA chez le candidat. Elle ne promeut pas automatiquement
l’adaptateur : `promoted` reste faux. L’intégration Studio suit l’étape 10 du
runbook, après revue des résultats.

Le score d’ancrage de ce contrôle est celui de `eval-chat-gold.ts`, basé sur
le recouvrement lexical des réponses. Il n’est pas un Recall@5 du RAG : ce
dernier reste à mesurer séparément par `scripts/ops/eval-aphrody-rag.ts` avec
les services et les stores réels. Une qualification locale ne clôt donc pas
à elle seule le chantier d’entraînement du plan directeur.

Les sources, snapshots, journaux et adaptateurs sont privés ; les garder hors
de Git et des artefacts publics. Les sept tests de la boucle couvrent l’ordre
des étapes, les défaillances et les critères de qualification ; ils ne prouvent
ni l’exécution GPU ni la qualité du modèle réel.
