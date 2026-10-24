<!-- SPDX-License-Identifier: Apache-2.0 -->

# Rédiger un brouillon d’article avec Shenron

Le MCP Shenron fournit `dragonball.agent_article_create` pour créer des articles
Markdown. Le script local `scripts/ops/create-article-draft.ts` ajoute des
citations à partir d’affirmations sourcées, envoie toujours le statut `draft`,
puis relit le brouillon pour vérifier qu’il est bien enregistré.

La clé `agent-api` est lue depuis le Gestionnaire d’identifiants Windows via
`Bun.secrets`. Elle ne doit pas être copiée dans le JSON, un fichier `.env`, la
ligne de commande ou Git. La clé nécessite `write:articles`; publier reste une
action distincte via le processus éditorial.

## Préparer un article

Créer un fichier JSON local, par exemple `var/drafts/beerus.json` :

```json
{
  "title": "Beerus et les dieux de la destruction",
  "slug": "beerus-dieux-destruction",
  "excerpt": "Présentation documentée du rôle de Beerus dans Dragon Ball Super.",
  "tags": ["Dragon Ball Super", "Personnages"],
  "markdown": "Beerus est présenté comme le dieu de la destruction de l’univers 7.\n\nL’article détaille ensuite son rôle et ses apparitions.",
  "sources": [
    {
      "title": "Présentation officielle de Dragon Ball Super",
      "url": "https://dragon-ball-official.com/",
      "anchor": "Beerus est présenté comme le dieu de la destruction de l’univers 7"
    }
  ]
}
```

Chaque `anchor` doit reprendre exactement dans le Markdown l’affirmation
qu’elle étaye. Le script ajoute le lien correspondant à cet endroit, refuse les
URL non HTTPS et Fandom, et refuse une source dont l’affirmation manque du texte.
Vérifier manuellement que chaque page source étaye réellement l’affirmation et
que le texte respecte les sources primaires du projet.

## Prévisualiser et enregistrer

```powershell
bun scripts/ops/create-article-draft.ts var/drafts/beerus.json
bun scripts/ops/create-article-draft.ts var/drafts/beerus.json --submit
```

Sans `--submit`, le script n’effectue aucune requête d’écriture. Avec
`--submit`, il crée un brouillon puis confirme sa présence avec une lecture
indépendante de la liste des brouillons. Les fichiers de travail sous `var/`
restent privés et ignorés par Git.
