# Modèle de décision du canon : CPU d'abord (relevé du 2026-11-19)

Contexte : le verdict de canon de `/api/canon` classe les preuves avec des règles (`apps/site/src/lib/canon-engine.ts`) puis demande un jugement « relation preuve et affirmation » au fournisseur distant TypeSafe AI (`packages/pipeline/src/ai/jev-provider.ts`). Ce jugement exige une clé et une sortie réseau. Cette note choisit un modèle libre qui tourne sur CPU et décrit son branchement.

## Sources lues

| Fait | Valeur | Source |
| --- | --- | --- |
| Famille de modèles libres la plus téléchargée en tendance GGUF | Qwen3.5 (2B : 5,5 M de téléchargements, 4B : 4,6 M, 9B : 6,4 M) | API Hugging Face `models?author=Qwen`, lue le 2026-11-19 |
| Licence de Qwen3.5-2B et Qwen3.5-4B | Apache-2.0 | `huggingface.co/api/models/Qwen/Qwen3.5-4B` (champ `cardData.license`) |
| Paramètres | 2 274 069 824 (2B), 4 659 865 088 (4B) | même API (`safetensors.total`) |
| Fichiers GGUF Q4_K_M | 1,28 Go (2B), 2,74 Go (4B) | `unsloth/Qwen3.5-{2B,4B}-GGUF` (licence Apache-2.0) |
| Écarté | `nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB` : licence « other » | même API |
| Moteur | llama.cpp, build `b12543` du 2026-11-19 (`ggml-org/llama.cpp`) ; la balise `v1.0.0` « latest » ne porte aucun binaire (un seul fichier `nightly-tag.txt`) | `gh api repos/ggml-org/llama.cpp/releases` |
| Documentation fw | `C:\src\fairwind\docs\GGML_COMPATIBILITY.md` : `ggml-org` compte 26 dépôts ; `crates/fw-ggml` implémente tenseurs 4D, graphe de calcul, format GGUF v3 et protocole `ggml-rpc` pour la parité de format, pas pour l'inférence de production | fichier lu le 2026-11-19 |

## Méthode

Chaque question de décision devient une génération d'**un seul jeton** : les issues sont étiquetées A, B, C, le modèle répond par une lettre, et la probabilité de chaque issue vient des log-probabilités de ce premier jeton, renormalisées sur les lettres valides (`packages/decision/src/llama-server.ts`, fournisseur `llamaServer`). La confiance est donc une probabilité du modèle, que l'abstention de `selections` peut comparer à un seuil, et non un nombre auto-déclaré (le fournisseur `local` existant renvoie toujours 1). Le coût CPU est le préremplissage du prompt, réutilisé d'une question à l'autre (`cache_prompt`).

Piège relevé en direct : Qwen3.5 ouvre sa réponse par un jeton de réflexion (`Thinking`, probabilité 0,9995) ; il faut `chat_template_kwargs: {"enable_thinking": false}`, sans quoi aucune lettre n'a de probabilité.

## Mesure (fr2, 6 fils, Q4_K_M, un jeton généré, `llama-server` b12543)

Six cas étiquetés à la main (affirmation, extrait, relation attendue : soutient, contredit, sans rapport). Échantillon minuscule : il valide le branchement, pas la précision.

| Modèle | Justes | Confiance des justes | Confiance de l'erreur | Latence par décision |
| --- | --- | --- | --- | --- |
| Qwen3.5-2B Q4_K_M | 5 sur 6 | 0,37 à 0,73 | 0,61 | 0,9 à 2,4 s |
| Qwen3.5-4B Q4_K_M | 5 sur 6 | 0,89 à 0,99 | 0,79 | 5,1 à 6,0 s |

L'unique erreur des deux modèles est le même cas (« Vegeta est un Namekien » face à « Vegeta est le prince des Saiyans »). Le 4B sépare mieux les justes des erreurs par la confiance ; le 2B est trois fois plus rapide.

## Décision

Défaut : **Qwen3.5-4B Q4_K_M** pour le canon (la précision et la séparation par la confiance priment sur la latence, le jugement est asynchrone par rapport à la page). Repli rapide : Qwen3.5-2B. Seuil d'abstention : à fixer sur un jeu étiqueté du canon (`CANON_JUDGMENT_POLICY.minimumConfidence` reste la valeur en vigueur tant qu'aucune mesure ne la remplace) ; ne pas déduire de seuil de six cas.

## Branchement

Variables : `SHENRON_LLAMA_URL` (par exemple `http://127.0.0.1:8081`), `SHENRON_LLAMA_MODEL`, `SHENRON_LLAMA_API_KEY` (optionnelle). Quand `SHENRON_LLAMA_URL` est posée, `configuredProvider` choisit le serveur local avant TypeSafe ; sans elle, rien ne change. Démarrage sur un hôte :

```sh
llama-server -m Qwen3.5-4B-Q4_K_M.gguf --host 127.0.0.1 --port 8081 -c 4096 -t <fils> --parallel 1 --cache-prompt --no-webui
```

Contraintes : prd ne fait tourner que la production, le serveur de décision vit donc sur `fr1` ou `fr2` et n'est joignable depuis prd que par le tunnel WireGuard (coupé le 2026-11-19, voir `AGENTS.md`) ou par un port ouvert à l'adresse de prd ; il écoute en local par défaut. fr2 n'avait que 4,9 Go de disque libre après le téléchargement du 4B : le modèle y est supprimé après essai si l'espace manque.

## À faire

Un jeu étiqueté du canon (au moins une centaine de paires affirmation et extrait tirées des planches de databooks publiques) pour mesurer précision, calibration et seuil ; l'exécution du serveur en unité systemd sur l'hôte choisi ; l'évaluation de `fw-ggml` comme lecteur GGUF dans `shenron-rag` une fois son API stable.
