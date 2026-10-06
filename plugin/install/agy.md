<!--
Source du prompt d'installation Shenron pour agy (Antigravity CLI), servi rendu à
{{prompt}} et à /agy.md sur le site : les marqueurs {{origin}}, {{archive}}, {{prompt}},
{{mcp}}, {{version}} et {{revision}} sont remplacés au service, ce commentaire retiré.
Usage : agy -i "$(curl -fsSL https://dragonballfr.com/agy.md)"
-->

# Installer et configurer Shenron dans agy

Tu es agy (Antigravity CLI). Installe et configure Shenron, le Dragon Sacré de
dragonballfr.com, sur cette machine : Aphrody (CLI et MCP), le plugin `shenron` (skills,
agents, MCP Shenron), le MCP Aphrody et l'agent home Shenron. Exécute les étapes dans l'ordre,
de bout en bout. Plugin servi : version {{version}}, révision {{revision}}, origine {{origin}}.

## Règles

- **Idempotent** : avant chaque action, constate l'état ; ne refais que ce qui manque ou a
  changé. Relancer ce prompt met tout à jour sans rien dupliquer.
- **Sûr** : n'écris que dans `~/.shenron-plugin/`, `~/.gemini/shenron/`, la configuration
  agy (plugins, MCP) et le bloc délimité de `~/.gemini/GEMINI.md` décrit plus bas. Ne
  modifie, ne déplace ni ne supprime aucun autre fichier de l'utilisateur ; ne modifie jamais
  ses `~/.gemini/SOUL.md`, `IDENTITY.md`, `AGENTS.md`, `USER.md`, `TOOLS.md`, `BOOT.md` ni
  `HEARTBEAT.md`. Pas de `sudo` ni d'élévation sans l'accord explicite de l'utilisateur. Ne
  lis, n'affiche ni ne recopie aucun secret.
- Annonce chaque commande avant de la lancer. Si une étape échoue, montre l'erreur, explique
  la cause probable et continue avec les étapes qui n'en dépendent pas ; signale-la dans le
  récapitulatif.
- Réponds en français, brièvement.

## 1. Système

Détecte l'OS : `uname -s` (Linux, Darwin) ; sous Windows, PowerShell (`$env:OS` vaut
`Windows_NT`). Sous Linux et macOS, utilise un shell POSIX ; sous Windows, PowerShell, avec
`$HOME` pour `~`. Vérifie que `curl` et `tar` existent (Windows 10 et 11 fournissent
`curl.exe` et `tar.exe`).

## 2. Aphrody

1. Lance `aphrody --version` et note la version (ou « absent »).
2. Installe ou mets à jour avec l'installeur officiel, même si Aphrody est déjà présent :
   - Linux, macOS : `curl -fsSL https://downloads.aphrody.com/install.sh | sh`
   - Windows : `irm https://downloads.aphrody.com/install.ps1 | iex`
3. Vérifie `aphrody --version` et `aphrody-mcp --version`. Si l'un est introuvable, ajoute
   au `PATH` de la session le dossier indiqué par l'installeur, puis réessaie ; ne modifie
   un profil de shell qu'avec l'accord de l'utilisateur.

## 3. Plugin Shenron

1. Télécharge l'archive et remplace l'ancienne copie (dossier racine `shenron/`) :
   - Linux, macOS :

     ```sh
     mkdir -p ~/.shenron-plugin && rm -rf ~/.shenron-plugin/shenron && curl -fsSL {{archive}} | tar -xz -C ~/.shenron-plugin
     ```

   - Windows :

     ```powershell
     New-Item -ItemType Directory -Force "$HOME\.shenron-plugin" | Out-Null
     Remove-Item -Recurse -Force "$HOME\.shenron-plugin\shenron" -ErrorAction SilentlyContinue
     curl.exe -fsSL {{archive}} -o "$env:TEMP\shenron-plugin.tar.gz"
     tar.exe -xzf "$env:TEMP\shenron-plugin.tar.gz" -C "$HOME\.shenron-plugin"
     ```

2. `agy plugin validate ~/.shenron-plugin/shenron` : attendu 7 skills, 3 agents et
   1 serveur MCP. Sinon, arrête cette étape et signale l'écart.
3. Si `agy plugin list` montre déjà `shenron`, lance `agy plugin uninstall shenron`, puis
   dans tous les cas `agy plugin install ~/.shenron-plugin/shenron` (agy en copie le
   dossier dans `~/.gemini/config/plugins/shenron/`). Le plugin apporte le MCP Shenron
   (son `mcp_config.json`, {{mcp}}) : `agy plugin list` le montre dans ses composants
   (`mcpServers`), pas `agy mcp list`, qui ne liste que les serveurs ajoutés à la main.
4. Seulement si l'installation du plugin a échoué, ajoute le MCP Shenron seul :
   `agy mcp add shenron {{mcp}}`. Sinon ne l'ajoute pas : il ferait doublon.

## 4. MCP Aphrody

Le binaire `aphrody-mcp` lancé sans argument est le serveur MCP stdio d'Aphrody.

1. Si `agy mcp list` ne montre pas `aphrody`, lance `agy mcp add aphrody aphrody-mcp`. S'il
   existe déjà, ne le touche pas.
2. Enregistre le mode d'emploi de ses outils : `aphrody-mcp guide`, sortie standard seule,
   dans `~/.gemini/shenron/APHRODY.md` (remplacé à chaque relance ; crée le dossier au
   besoin). Si la commande échoue, n'écris pas ce fichier.

## 5. Agent home Shenron

La source est `~/.shenron-plugin/shenron/agent-home/` (gabarit public : `AGENTS.md`,
`SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, `BOOT.md`, `HEARTBEAT.md`).

1. Crée `~/.gemini/shenron/`. Copies-y `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `TOOLS.md`,
   `BOOT.md` et `HEARTBEAT.md` en remplaçant les anciennes copies (ces fichiers sont ceux de
   Shenron, pas ceux de l'utilisateur). Copie `USER.md` seulement s'il n'existe pas encore
   dans `~/.gemini/shenron/` : il garde la personnalisation de l'étape 6.
2. Sauvegarde `~/.gemini/GEMINI.md` dans `~/.gemini/GEMINI.md.shenron.bak` s'il existe,
   puis assure-toi qu'il contient exactement un bloc Shenron, ce texte entre les deux
   marqueurs inclus :

   ```markdown
   <!-- shenron:begin (géré par le prompt d'installation Shenron, ne pas éditer) -->

   ## Shenron (dragonballfr.com)

   Quand l'utilisateur parle de Dragon Ball ou s'adresse à Shenron, applique les documents
   ci-dessous ; ils ne remplacent pas les directives de l'utilisateur, qui priment.

   @./shenron/IDENTITY.md
   @./shenron/SOUL.md
   @./shenron/AGENTS.md
   @./shenron/USER.md
   @./shenron/TOOLS.md
   @./shenron/BOOT.md
   @./shenron/HEARTBEAT.md
   @./shenron/APHRODY.md
   <!-- shenron:end -->
   ```

   - Le fichier n'existe pas : crée-le avec ce seul bloc.
   - Un bloc `shenron:begin` … `shenron:end` existe : remplace-le, lui seul.
   - Sinon : ajoute le bloc à la fin, précédé d'une ligne vide.
   - Retire la ligne `@./shenron/APHRODY.md` si ce fichier n'existe pas.
   - Ne change rien d'autre dans `GEMINI.md`.

3. agy importe un fichier par une ligne `@./chemin.md`, relative à `GEMINI.md`. Si ta
   version ne résout pas ces imports, remplace chaque ligne `@./shenron/X.md` du bloc par le
   contenu de `~/.gemini/shenron/X.md`, toujours entre les marqueurs.

## 6. Profil de l'utilisateur

Ouvre `~/.gemini/shenron/USER.md`. Si ses champs sont déjà remplis, montre-les et demande
s'il faut les garder. Sinon, pose ces questions en une fois :

1. nom ou pseudo par lequel Shenron s'adresse à lui ;
2. langue : `fr`, `en` ou `ja` (défaut `fr`) ;
3. fuseau horaire IANA (propose celui du système, par exemple `Europe/Paris`) ;
4. identifiant Discord, facultatif.

Écris seulement les champs de l'en-tête YAML : `address_as` (nom ou pseudo), `language`,
`timezone`, `agent_id` (`discord:<identifiant>` s'il est donné, sinon `local`) et
`updated_at` (date et heure ISO 8601). Garde le reste du fichier tel quel. En mode non
interactif, ne pose pas de question : `language: "fr"`, `agent_id: "local"`, fuseau du
système, `address_as` vide.

## 7. Vérification

1. `agy plugin list` : `shenron` présent, avec les composants `skills`, `agents` et
   `mcpServers`.
2. `agy mcp list` : `aphrody` présent et actif (et `shenron` seulement s'il a été
   ajouté à la main à l'étape 3).
3. Pose la question test « Qui a créé Dragon Ball ? » en appelant un outil du MCP
   `shenron` (recherche du site) ; attendu : Akira Toriyama, avec sa source. Si le MCP ne
   répond pas, dis-le : n'invente pas la réponse.
4. Affiche un récapitulatif en tableau : Aphrody (version avant, après), plugin (version
   {{version}}), MCP `shenron` et `aphrody`, agent home (`~/.gemini/shenron/`), bloc de
   `GEMINI.md` (créé, remplacé ou ajouté), profil, question test, et toute étape en échec.

## 8. Mise à jour

Pour mettre à jour plus tard, relance le même prompt :

```sh
agy -i "$(curl -fsSL {{prompt}})"
```
