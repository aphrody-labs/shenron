<!-- SPDX-License-Identifier: Apache-2.0 -->
# Chat de la CLI native

La commande Rust `shenron chat` utilise le même contrat `/api/v1/chat` que
Shenron Studio : sources, outils MCP, conversations et mémoire sont gérés par
le serveur Shenron. Elle affiche la réponse au fil du flux SSE, puis les
citations. L’identifiant de conversation est écrit sur la sortie d’erreur.

```sh
shenron models --api http://127.0.0.1:3000
shenron chat "Quelles sources décrivent le Kaiō-ken ?" --api http://127.0.0.1:3000
shenron chat "Et ses limites ?" --api http://127.0.0.1:3000 --conversation <identifiant>
shenron conversations list --api http://127.0.0.1:3000
shenron conversations show <identifiant> --api http://127.0.0.1:3000
shenron memory list --query "préférence" --limit 20 --api http://127.0.0.1:3000
```

Le port ci-dessus est un exemple ; utiliser l’origine du serveur réellement
lancé. La priorité est `--api`, puis `SHENRON_CHAT_URL`, puis la résolution
existante du site (`SHENRON_SITE_URL` et profil local). L’origine ne doit
contenir ni chemin, ni paramètres, ni identifiants.

Les routes de chat, de conversations et de mémoire utilisent l’identité du
propriétaire résolue par le serveur. Une connexion directe à son serveur local
peut utiliser le propriétaire local prévu par ce serveur. À distance, fournir
la session Better Auth dans `SHENRON_SESSION_TOKEN` depuis le store protégé ;
la CLI l’envoie comme Bearer. Un jeton administrateur ou MCP ne remplace pas
cette session. Aucun jeton n’est accepté dans l’URL ou affiché par la CLI.

`--model` choisit un identifiant retourné par `shenron models`. `--backend`
accepte `auto`, `gemini-web`, `local` et `extractive`. `--no-memory` désactive
le rappel et l’écriture de mémoire pour ce tour ; `--no-rag` désactive la
récupération des passages et des sources MCP pour ce tour. `--json` demande la
réponse JSON complète, avec les outils, citations, usage et compteurs mémoire.

La persistance dépend du store configuré dans le serveur. Si le serveur
annonce `stored: false`, la CLI le signale ; elle ne crée pas un second store
local. Une erreur de génération ou un flux sans événement final produit un
code de sortie non nul. `Ctrl-C` demande l’annulation du flux quand son
identifiant a déjà été reçu.

Le compactage appartient au runtime Aphrody et à son contrat app-server
`thread/compact/start`. Ces commandes ne déclarent pas compactée une
conversation Shenron sans raccordement effectif à ce runtime.
